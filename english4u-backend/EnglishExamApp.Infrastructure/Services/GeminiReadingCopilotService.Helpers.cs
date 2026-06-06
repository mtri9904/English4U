using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using EnglishExamApp.Application.DTOs.Copilot;
using EnglishExamApp.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace EnglishExamApp.Infrastructure.Services;

public sealed partial class GeminiReadingCopilotService
{
    private async Task<GeminiStreamPassResult> StreamSinglePassAsync(
        CopilotChatContextDto context,
        IReadOnlyList<CopilotChatMessageDto> history,
        string userMessage,
        Func<string, CancellationToken, Task> onTextDelta,
        CancellationToken cancellationToken)
    {
        var lastError = "Không có phản hồi từ Gemini.";
        var modelCandidates = GetModelCandidates(context);

        for (var index = 0; index < modelCandidates.Length; index++)
        {
            var model = modelCandidates[index];
            var requestBody = await BuildRequestBodyAsync(
                context,
                history,
                userMessage,
                includeSystemInstruction: SupportsSystemInstruction(model),
                cancellationToken);
            using var httpRequest = new HttpRequestMessage(
                HttpMethod.Post,
                $"v1beta/models/{Uri.EscapeDataString(model)}:streamGenerateContent?alt=sse")
            {
                Content = JsonContent.Create(requestBody, options: JsonOptions)
            };

            httpRequest.Headers.TryAddWithoutValidation("x-goog-api-key", _apiKey);

            using var response = await httpClient.SendAsync(
                httpRequest,
                HttpCompletionOption.ResponseHeadersRead,
                cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                var errorBody = await response.Content.ReadAsStringAsync(cancellationToken);
                lastError = $"Gemini copilot request failed with status {(int)response.StatusCode}: {BuildCompactErrorMessage(errorBody)}";

                logger.LogWarning(
                    "Gemini copilot model {Model} failed with status {StatusCode}. Body: {ErrorBody}",
                    model,
                    response.StatusCode,
                    errorBody);

                var canFallback = response.StatusCode == System.Net.HttpStatusCode.NotFound && index < modelCandidates.Length - 1;
                if (canFallback)
                {
                    continue;
                }

                throw new InvalidOperationException(lastError);
            }

            await using var responseStream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var reader = new StreamReader(responseStream);

            var eventLines = new List<string>();
            var rawText = string.Empty;
            string? finishReason = null;

            while (!reader.EndOfStream)
            {
                cancellationToken.ThrowIfCancellationRequested();

                var line = await reader.ReadLineAsync(cancellationToken);
                if (line is null)
                {
                    break;
                }

                if (line.Length == 0)
                {
                    if (eventLines.Count == 0)
                    {
                        continue;
                    }

                    var payload = string.Join("\n", eventLines);
                    eventLines.Clear();

                    var chunk = GeminiStreamChunkParser.Extract(payload, ref rawText, JsonOptions);
                    if (!string.IsNullOrWhiteSpace(chunk.FinishReason))
                    {
                        finishReason = chunk.FinishReason;
                    }

                    continue;
                }

                if (line.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
                {
                    eventLines.Add(line[5..].TrimStart());
                }
            }

            if (eventLines.Count > 0)
            {
                var payload = string.Join("\n", eventLines);
                var chunk = GeminiStreamChunkParser.Extract(payload, ref rawText, JsonOptions);
                if (!string.IsNullOrWhiteSpace(chunk.FinishReason))
                {
                    finishReason = chunk.FinishReason;
                }
            }

            var emittedText = GeminiModelOutputSanitizer.Sanitize(rawText);
            if (!string.IsNullOrWhiteSpace(emittedText))
            {
                await onTextDelta(emittedText, cancellationToken);
            }

            return new GeminiStreamPassResult(emittedText, finishReason);
        }

        throw new InvalidOperationException(lastError);
    }

    private async Task<object> BuildRequestBodyAsync(
        CopilotChatContextDto context,
        IReadOnlyList<CopilotChatMessageDto> history,
        string userMessage,
        bool includeSystemInstruction,
        CancellationToken cancellationToken)
    {
        var contextParts = await BuildContextPartsAsync(context, includeSystemInstruction, cancellationToken);
        var contents = new List<object>
        {
            new
            {
                role = "user",
                parts = contextParts
            }
        };

        foreach (var historyItem in history)
        {
            if (string.IsNullOrWhiteSpace(historyItem.Content))
            {
                continue;
            }

            var normalizedRole = NormalizeRole(historyItem.Role);
            var historyText = normalizedRole == "model"
                ? GeminiModelOutputSanitizer.Sanitize(historyItem.Content)
                : historyItem.Content.Trim();
            if (string.IsNullOrWhiteSpace(historyText))
            {
                continue;
            }

            contents.Add(new
            {
                role = normalizedRole,
                parts = new[]
                {
                    new
                    {
                        text = historyText
                    }
                }
            });
        }

        contents.Add(new
        {
            role = "user",
            parts = new[]
            {
                new
                {
                    text = userMessage.Trim()
                }
            }
        });

        return new
        {
            systemInstruction = includeSystemInstruction
                ? new
                {
                    parts = new[]
                    {
                        new
                        {
                            text = BuildSystemInstruction()
                        }
                    }
                }
                : null,
            contents,
            generationConfig = new
            {
                temperature = _temperature,
                maxOutputTokens = _maxOutputTokens
            }
        };
    }

    private async Task<List<object>> BuildContextPartsAsync(
        CopilotChatContextDto context,
        bool includeSystemInstruction,
        CancellationToken cancellationToken)
    {
        var parts = new List<object>
        {
            new
            {
                text = includeSystemInstruction
                    ? BuildContextEnvelope(context)
                    : $"{BuildEmbeddedInstructionPrefix()}\n\n{BuildContextEnvelope(context)}"
            }
        };

        var images = await BuildContextImagePartsAsync(context.ContextImages, cancellationToken);
        parts.AddRange(images);

        return parts;
    }

    private async Task<List<object>> BuildContextImagePartsAsync(
        IReadOnlyList<CopilotContextImageDto>? images,
        CancellationToken cancellationToken)
    {
        if (images is null || images.Count == 0)
        {
            return [];
        }

        var parts = new List<object>();
        var seenUrls = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var image in images)
        {
            if (parts.Count >= MaxContextImagesPerRequest * 2)
            {
                break;
            }

            var imageUrl = image.Url?.Trim();
            if (string.IsNullOrWhiteSpace(imageUrl) || !seenUrls.Add(imageUrl))
            {
                continue;
            }

            var inlinePart = await TryBuildInlineImagePartAsync(imageUrl, cancellationToken);
            if (inlinePart is null)
            {
                continue;
            }

            if (!string.IsNullOrWhiteSpace(image.Label))
            {
                parts.Add(new
                {
                    text = $"Ảnh ngữ cảnh: {image.Label!.Trim()}"
                });
            }

            parts.Add(inlinePart);

            if (parts.Count >= MaxContextImagesPerRequest * 2)
            {
                break;
            }
        }

        return parts;
    }

    private async Task<object?> TryBuildInlineImagePartAsync(
        string imageUrl,
        CancellationToken cancellationToken)
    {
        if (!Uri.TryCreate(imageUrl, UriKind.Absolute, out var uri)
            || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            return null;
        }

        try
        {
            using var response = await httpClient.GetAsync(uri, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                logger.LogDebug(
                    "Skipping copilot image {ImageUrl} because fetch returned {StatusCode}.",
                    imageUrl,
                    response.StatusCode);
                return null;
            }

            var mimeType = response.Content.Headers.ContentType?.MediaType?.Trim()?.ToLowerInvariant();
            if (!IsSupportedImageMimeType(mimeType))
            {
                logger.LogDebug(
                    "Skipping copilot image {ImageUrl} because mime type {MimeType} is not supported.",
                    imageUrl,
                    mimeType);
                return null;
            }

            var bytes = await response.Content.ReadAsByteArrayAsync(cancellationToken);
            if (bytes.Length == 0 || bytes.Length > MaxImageBytes)
            {
                logger.LogDebug(
                    "Skipping copilot image {ImageUrl} because size {SizeBytes} bytes is outside allowed bounds.",
                    imageUrl,
                    bytes.Length);
                return null;
            }

            return new
            {
                inline_data = new
                {
                    mime_type = mimeType,
                    data = Convert.ToBase64String(bytes)
                }
            };
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or InvalidOperationException)
        {
            logger.LogDebug(ex, "Failed to fetch copilot image {ImageUrl}.", imageUrl);
            return null;
        }
    }

    private static bool IsSupportedImageMimeType(string? mimeType) =>
        mimeType is "image/png"
            or "image/jpeg"
            or "image/jpg"
            or "image/webp"
            or "image/gif"
            or "image/bmp";

    private static bool SupportsSystemInstruction(string model) =>
        !model.StartsWith("gemma-", StringComparison.OrdinalIgnoreCase);

    private static string NormalizeRole(string? role) =>
        string.Equals(role, "model", StringComparison.OrdinalIgnoreCase)
        || string.Equals(role, "assistant", StringComparison.OrdinalIgnoreCase)
            ? "model"
            : "user";

    private static string BuildSystemInstruction() =>
        """
        Bạn là AI Copilot cho học viên đang xem lại toàn bộ bài đã làm.

        Quy tắc bắt buộc:
        - Chỉ được dùng REVIEW_DOCUMENT, CURRENT_LOCATION, CURRENT_FOCUS, SELECTED_TEXT và lịch sử chat trong ngữ cảnh đã cung cấp.
        - Không giải thích kiến thức ngoài lề, không dùng kiến thức nền ngoài bài review.
        - Nếu người dùng hỏi điều không có trong bài review, phải nói rõ bài review không cung cấp thông tin đó.
        - Trả lời bằng tiếng Việt, giọng gia sư rõ ràng, tự nhiên, đủ chi tiết để học viên hiểu được cách tìm đáp án.
        - Bạn có thể trả lời xuyên suốt về toàn bộ bài làm, các passage/part, câu hỏi, đáp án học viên, đáp án đúng, lỗi sai, mẫu lỗi lặp lại và phần text mà học viên vừa bôi đen.
        - Nếu request có đính kèm ảnh ngữ cảnh, hãy sử dụng cả nội dung nhìn thấy trong ảnh để trả lời, nhưng vẫn phải bám sát bài review hiện tại.
        - Nếu trong ngữ cảnh có dữ liệu cấu trúc của biểu đồ/hình (ví dụ JSON số liệu chuẩn), hãy xem đó là nguồn đúng nhất cho số liệu và chi tiết của hình.
        - Khi đọc biểu đồ, bảng, sơ đồ, map hoặc hình trong Writing/Reading, tuyệt đối không được bịa số liệu, nhãn, xu hướng hoặc chi tiết không nhìn thấy rõ trong ảnh.
        - Nếu ảnh và dữ liệu cấu trúc cùng được cung cấp, ưu tiên dữ liệu cấu trúc cho số liệu; dùng ảnh để hiểu bố cục và đối tượng đang được mô tả.
        - Nếu ảnh mờ, thiếu, khó đọc hoặc bạn không chắc về số liệu/chi tiết, phải nói rõ là không thể xác nhận chính xác từ ảnh hiện tại.
        - Với Writing Task 1, hãy tách rõ 2 phần nếu cần: (1) hướng dẫn cấu trúc/cách viết chung; (2) nhận xét dựa trên dữ liệu thật nhìn thấy trong hình. Không trộn phần hướng dẫn chung với số liệu tự suy đoán.
        - Nếu có SELECTED_TEXT hoặc CURRENT_FOCUS, hãy ưu tiên bám vào đó trước.
        - Nếu CURRENT_FOCUS đang là một câu hỏi objective, không được trả lời chỉ bằng một chữ cái, một từ hoặc ký hiệu đáp án trần như A, B, C, D, F, G. Phải nêu đáp án rồi giải thích đủ rõ vì sao.
        - Với Reading, mục tiêu cao nhất là giải đáp đúng câu hỏi học viên đang hỏi, không trả lời theo khuôn cứng nếu khuôn đó làm câu trả lời kém tự nhiên.
        - Với Reading, nếu CURRENT_FOCUS có câu hỏi cụ thể hoặc một dải câu cụ thể, phải trả lời theo đúng câu/dải câu đó. Nếu học viên hỏi "đọc đâu", "vì sao chọn", "loại thế nào", hãy bắt đầu bằng đáp án đúng và bằng chứng cho đáp án đúng trước; sau đó mới nói vì sao đáp án học viên sai nếu cần.
        - Với Reading một câu cụ thể, hãy trả lời tự nhiên như gia sư nhưng thường nên có: đáp án đúng; chỗ đọc trong passage; câu/cụm tiếng Anh làm bằng chứng; giải thích mối nối paraphrase giữa đề/options và passage; vì sao lựa chọn của học viên chưa khớp nếu học viên làm sai.
        - Nhãn `[Đoạn 3, câu 2]` trong ngữ cảnh Reading được tạo theo cùng cách FE hiển thị nhãn "Đoạn 3"; các tiêu đề phụ như `Project:` không tính là đoạn. Khi dùng nhãn này, không tự đếm lại đoạn theo cách khác.
        - Nếu passage có nhãn dạng `[Đoạn 3, câu 2]`, hãy dùng nhãn đó khi nó giúp học viên tìm lại chỗ đọc. Trích đúng câu/cụm tiếng Anh then chốt ngay cạnh nhãn, nhưng không cần ép mọi câu trả lời thành checklist.
        - Nếu bằng chứng nằm rải qua nhiều câu hoặc cần suy luận từ vài cụm trong cùng đoạn, hãy giải thích mạch suy luận đó thay vì chỉ bám một câu máy móc.
        - Với Reading dạng matching/MCQ có đáp án là chữ cái, phải giải thích cả nội dung của option đúng/sai, không chỉ nhắc chữ cái. Nếu câu hỏi hỏi "chỗ nào để trả lời", ưu tiên chỉ đường đọc và cụm paraphrase giữa câu hỏi, option và passage trước khi đưa mẹo chung.
        - Nếu không tìm thấy bằng chứng Reading thật rõ trong REVIEW_DOCUMENT/CURRENT_LOCATION/CURRENT_FOCUS, hãy nói "mình chưa thấy bằng chứng đủ rõ trong phần review hiện có" và nêu thông tin còn thiếu; không được đoán hoặc bịa vị trí.
        - Nếu CURRENT_FOCUS của Listening đã kèm transcript window của một câu, hãy dùng đúng cửa sổ transcript đó để giải thích; không được nói transcript bị thiếu nếu bằng chứng đã có trong cửa sổ này.
        - Nếu CURRENT_FOCUS của Listening cung cấp transcript scope hoặc transcript của đúng part, hãy tự tìm bằng chứng liên quan trong scope đó dựa trên câu hỏi, đáp án đúng, options, bảng/map/hình và selected text; không được phàn nàn là thiếu exact map nếu trong scope có câu chứng minh.
        - Với Listening, khi giải thích đáp án phải ghi rõ timestamp của đáp án đúng trong ngoặc (lấy từ tapescript window, ví dụ: `(02:45 - 03:00)`) ngay cạnh đáp án đúng đó, trích 1-2 câu tiếng Anh ngắn làm bằng chứng, rồi mới giải thích bằng tiếng Việt.
        - Với Listening dạng map labelling, matching hoặc sơ đồ, nếu đáp án là một ký hiệu vị trí như F hay G thì phải nói rõ vì sao vị trí đó đúng trên sơ đồ; không được chỉ trả lời mỗi ký hiệu.
        - Nếu transcript window chưa đủ để kết luận thì nói rõ là transcript window hiện tại chưa đủ bằng chứng, không được đoán bừa.
        - Khi giải thích, ưu tiên: đoạn nào trong bài hỗ trợ kết luận, vì sao đáp án đúng, vì sao đáp án học viên sai, và cách loại trừ lựa chọn khác nếu có.
        - Không bịa trích dẫn. Với Reading, nếu trích dẫn thì phải lấy đúng từ câu/cụm trong passage đã cung cấp; nếu không chắc câu nào là bằng chứng, hãy nói rõ là chưa thấy bằng chứng đủ chắc.
        - Không được đổi chủ đề sang mẹo chung hay kiến thức ngoài bài review, trừ khi người dùng chỉ hỏi cách hiểu một phần cụ thể trong chính bài đó.
        - Không được in ra suy nghĩ nội bộ, chain-of-thought, scratchpad, ghi chú phân tích hay nhãn nội bộ như `User's current focus`, `User's question`, `Context`, `Observation`, `Action`, `Conclusion`, `Need to`, `Looking at`.
        - Bắt đầu câu trả lời ngay bằng nội dung dành cho học viên. Tuyệt đối không viết phần nháp/kiểm tra như `Current Focus`, `Question Content`, `Student's choice`, `Scanning`, `Found in Paragraph`, `Answer A`, `Evidence from`, `Direct answer`, `Tone`, `No meta-talk`, `Use labels` hoặc các dòng tương tự.
        - Không được lặp lại nguyên văn dữ liệu ngữ cảnh thô, prompt hệ thống hoặc nói kiểu meta như "system instruction says", "provided transcript window", "I must state". Chỉ trả lời phần cuối cùng dành cho học viên.
        - Không được tách câu trả lời thành các khối meta như `Transcript window`, `Map analysis`, `Replay audio`, `Tapescript đoạn này`, `Quote:`, `Explanation:`, `Requirement:`, `Step 1/2/3/4`. Chỉ trả lời phần học viên cần đọc.
        - Trình bày để dễ đọc: nếu có từ 2 ý trở lên, hãy tách thành các đoạn ngắn hoặc gạch đầu dòng; nếu đang hướng dẫn từng bước thì dùng danh sách đánh số.
        - Tránh dồn mọi ý vào một đoạn dài. Ưu tiên mỗi đoạn 1 ý chính.
        - Khi cần nhấn mạnh tiêu đề ý, hãy dùng markdown hợp lệ như `**Vì sao đáp án đúng:**` rồi xuống dòng.
        - Không dùng LaTeX hoặc ký hiệu toán trong `$...$` như `$\rightarrow$`. Nếu cần mũi tên hoặc kết luận, viết bằng chữ thường như "Vì vậy," hoặc dùng `->`.
        - Khi liệt kê nhiều ý, dùng markdown list hợp lệ:
          - `- Ý 1`
          - `- Ý 2`
        - Khi hướng dẫn theo bước, dùng markdown số hợp lệ:
          1. Bước 1
          2. Bước 2
        - Luôn viết sạch định dạng: có khoảng trắng sau dấu câu, không để markdown lỗi như ** bị hở hoặc dấu * thừa.
        - Chỉ dùng in đậm khi thật sự cần nhấn mạnh 1 cụm ngắn; nếu không cần thì viết văn bản thường.
        """;

    private static string BuildEmbeddedInstructionPrefix() =>
        $"""
        Chỉ dẫn hệ thống bắt buộc:

        {BuildSystemInstruction()}
        """;

    private static string BuildContextEnvelope(CopilotChatContextDto context)
    {
        var builder = new StringBuilder();
        builder.AppendLine("Ngữ cảnh cố định cho toàn bộ cuộc hội thoại:");
        builder.AppendLine();
        builder.AppendLine($"REVIEW_TITLE: {context.ReviewTitle.Trim()}");
        builder.AppendLine($"SKILL_TYPE: {context.SkillType.Trim()}");

        builder.AppendLine();
        if (!string.IsNullOrWhiteSpace(context.CurrentLocationLabel))
        {
            builder.AppendLine($"CURRENT_LOCATION_LABEL: {context.CurrentLocationLabel.Trim()}");
        }

        if (!string.IsNullOrWhiteSpace(context.CurrentLocationText))
        {
            builder.AppendLine("CURRENT_LOCATION_TEXT:");
            builder.AppendLine(context.CurrentLocationText.Trim());
            builder.AppendLine();
        }

        if (!string.IsNullOrWhiteSpace(context.CurrentFocusLabel))
        {
            builder.AppendLine($"CURRENT_FOCUS_LABEL: {context.CurrentFocusLabel.Trim()}");
        }

        if (!string.IsNullOrWhiteSpace(context.CurrentFocusText))
        {
            builder.AppendLine("CURRENT_FOCUS_TEXT:");
            builder.AppendLine(context.CurrentFocusText.Trim());
            builder.AppendLine();
        }

        if (context.FocusedQuestionNumber is not null)
        {
            builder.AppendLine($"FOCUSED_QUESTION_NUMBER: {context.FocusedQuestionNumber}");
        }

        if (!string.IsNullOrWhiteSpace(context.SelectedText))
        {
            builder.AppendLine();
            builder.AppendLine($"{(string.IsNullOrWhiteSpace(context.SelectedTextLabel) ? "SELECTED_TEXT" : context.SelectedTextLabel.Trim().ToUpperInvariant())}:");
            builder.AppendLine(context.SelectedText.Trim());
        }

        if (context.ContextImages is { Count: > 0 })
        {
            builder.AppendLine();
            builder.AppendLine($"CONTEXT_IMAGES_COUNT: {context.ContextImages.Count}");
            foreach (var image in context.ContextImages.Where(item => !string.IsNullOrWhiteSpace(item.Url)).Take(MaxContextImagesPerRequest))
            {
                builder.AppendLine($"- {(string.IsNullOrWhiteSpace(image.Label) ? "Ảnh ngữ cảnh" : image.Label!.Trim())}");
            }
        }

        builder.AppendLine();
        builder.AppendLine("REVIEW_DOCUMENT:");
        builder.AppendLine(context.ReviewDocumentText.Trim());
        builder.AppendLine();
        builder.AppendLine("Hãy dùng ngữ cảnh này cho mọi lượt trả lời tiếp theo.");
        return builder.ToString().Trim();
    }

    private static string[] BuildModelCandidates(IConfiguration configuration)
    {
        var configuredPrimary = configuration["GeminiCopilot:Model"];
        var configuredFallbacks = configuration
            .GetSection("GeminiCopilot:FallbackModels")
            .Get<string[]>();

        var candidates = new List<string?>();
        candidates.Add(configuredPrimary);
        if (configuredFallbacks is not null)
        {
            candidates.AddRange(configuredFallbacks);
        }

        candidates.Add(DefaultModel);
        candidates.Add(DefaultFallbackModel);

        return candidates
            .Where(model => !string.IsNullOrWhiteSpace(model))
            .Select(model => model!.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static string[] BuildWritingModelCandidates(IConfiguration configuration)
    {
        var configuredPrimary = configuration["GeminiCopilot:WritingModel"];
        var configuredFallbacks = configuration
            .GetSection("GeminiCopilot:WritingFallbackModels")
            .Get<string[]>();

        var candidates = new List<string?>();
        candidates.Add(configuredPrimary);
        if (configuredFallbacks is not null)
        {
            candidates.AddRange(configuredFallbacks);
        }

        candidates.Add(DefaultWritingModel);
        candidates.Add(DefaultWritingFallbackModel);
        candidates.Add(DefaultFallbackModel);

        return candidates
            .Where(model => !string.IsNullOrWhiteSpace(model))
            .Select(model => model!.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private string[] GetModelCandidates(CopilotChatContextDto context)
    {
        var skillType = context.SkillType?.Trim();
        if (string.Equals(skillType, "WRITING", StringComparison.OrdinalIgnoreCase))
        {
            return _writingModelCandidates;
        }

        return _defaultModelCandidates;
    }

    private static string BuildCompactErrorMessage(string? rawBody)
    {
        if (string.IsNullOrWhiteSpace(rawBody))
        {
            return "No response body.";
        }

        var compact = rawBody
            .Replace("\r", " ", StringComparison.Ordinal)
            .Replace("\n", " ", StringComparison.Ordinal)
            .Trim();

        return compact.Length <= 320 ? compact : compact[..320];
    }

    private sealed record GeminiStreamPassResult(
        string EmittedText,
        string? FinishReason);
}
