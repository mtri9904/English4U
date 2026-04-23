using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using EnglishExamApp.Application.DTOs.Copilot;
using EnglishExamApp.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace EnglishExamApp.Infrastructure.Services;

public sealed class GeminiReadingCopilotService(
    HttpClient httpClient,
    IConfiguration configuration,
    ILogger<GeminiReadingCopilotService> logger) : IReadingCopilotService
{
    private const string DefaultModel = "gemini-2.5-flash";
    private const string DefaultFallbackModel = "gemini-2.5-flash-lite";
    private const string DefaultWritingModel = "gemini-2.5-flash-lite";
    private const string DefaultWritingFallbackModel = "gemini-2.5-flash";
    private const int MaxContinuationPasses = 3;
    private const string MaxTokensFinishReason = "MAX_TOKENS";
    private const string StopFinishReason = "STOP";
    private const string ContinuationPrompt =
        "Tiếp tục ngay đúng phần câu trả lời đang dở. Không lặp lại ý đã nói, không mở đầu lại, chỉ viết tiếp phần còn lại bằng tiếng Việt.";
    private const string TruncatedNotice =
        "\n\nPhần trả lời đang quá dài nên tạm dừng tại đây. Bạn có thể nhắn \"tiếp tục\" để tôi nối đúng phần còn lại.";
    private const int MaxContextImagesPerRequest = 4;
    private const int MaxImageBytes = 4 * 1024 * 1024;

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true,
        AllowTrailingCommas = true,
        ReadCommentHandling = JsonCommentHandling.Skip
    };

    private readonly string _apiKey =
        configuration["GeminiCopilot:ApiKey"]
        ?? configuration["GemmaExamGeneration:ApiKey"]
        ?? configuration["GeminiScoring:ApiKey"]
        ?? configuration["GEMINI_API_KEY"]
        ?? string.Empty;

    private readonly string[] _defaultModelCandidates = BuildModelCandidates(configuration);
    private readonly string[] _writingModelCandidates = BuildWritingModelCandidates(configuration);
    private readonly double _temperature = configuration.GetValue<double?>("GeminiCopilot:Temperature") ?? 0.25d;
    private readonly int _maxOutputTokens = Math.Clamp(
        configuration.GetValue<int?>("GeminiCopilot:MaxOutputTokens") ?? 1024,
        256,
        4096);

    public async Task StreamChatAsync(
        CopilotChatRequestDto request,
        Func<string, CancellationToken, Task> onTextDelta,
        CancellationToken cancellationToken = default)
    {
        ValidateRequest(request);

        if (string.IsNullOrWhiteSpace(_apiKey))
        {
            throw new InvalidOperationException("Gemini copilot API key is missing. Configure GeminiCopilot:ApiKey or GEMINI_API_KEY.");
        }

        var history = (request.ChatHistory ?? [])
            .Where(item => !string.IsNullOrWhiteSpace(item.Content))
            .Select(item => new CopilotChatMessageDto(NormalizeRole(item.Role), item.Content.Trim()))
            .ToList();

        var pendingUserMessage = request.UserMessage.Trim();
        for (var continuationPass = 0; continuationPass < MaxContinuationPasses; continuationPass++)
        {
            var response = await StreamSinglePassAsync(
                request.Context,
                history,
                pendingUserMessage,
                onTextDelta,
                cancellationToken);

            history.Add(new CopilotChatMessageDto("user", pendingUserMessage));
            if (!string.IsNullOrWhiteSpace(response.EmittedText))
            {
                history.Add(new CopilotChatMessageDto("model", response.EmittedText));
            }

            if (!ShouldContinueResponse(response))
            {
                return;
            }

            var canContinue = continuationPass < MaxContinuationPasses - 1
                && !string.IsNullOrWhiteSpace(response.EmittedText);

            if (!canContinue)
            {
                await onTextDelta(TruncatedNotice, cancellationToken);
                return;
            }

            pendingUserMessage = ContinuationPrompt;
        }
    }

    private static bool ShouldContinueResponse(GeminiStreamPassResult response)
    {
        if (string.IsNullOrWhiteSpace(response.EmittedText))
        {
            return false;
        }

        if (string.Equals(response.FinishReason, MaxTokensFinishReason, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (string.Equals(response.FinishReason, StopFinishReason, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        return LooksTruncated(response.EmittedText);
    }

    private static bool LooksTruncated(string value)
    {
        var trimmed = value.TrimEnd();
        if (string.IsNullOrWhiteSpace(trimmed) || trimmed.Length < 160)
        {
            return false;
        }

        var lastChar = trimmed[^1];
        if (lastChar is ':' or ',' or ';' or '-' or '|' or '/' or '(' or '[' or '{')
        {
            return true;
        }

        return lastChar is not '.' and not '!' and not '?' and not '…' and not '"' and not '\'' and not ')' and not ']' and not '}';
    }

    private static void ValidateRequest(CopilotChatRequestDto request)
    {
        if (request.Context is null)
        {
            throw new InvalidOperationException("Copilot context is required.");
        }

        if (string.IsNullOrWhiteSpace(request.Context.ReviewDocumentText))
        {
            throw new InvalidOperationException("Review document text is required.");
        }

        if (string.IsNullOrWhiteSpace(request.Context.ReviewTitle))
        {
            throw new InvalidOperationException("Review title is required.");
        }

        if (string.IsNullOrWhiteSpace(request.UserMessage))
        {
            throw new InvalidOperationException("User message is required.");
        }
    }

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

                    var chunk = ExtractStreamChunk(payload, ref rawText);
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
                var chunk = ExtractStreamChunk(payload, ref rawText);
                if (!string.IsNullOrWhiteSpace(chunk.FinishReason))
                {
                    finishReason = chunk.FinishReason;
                }
            }

            var emittedText = SanitizeModelOutput(rawText);
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

            contents.Add(new
            {
                role = NormalizeRole(historyItem.Role),
                parts = new[]
                {
                    new
                    {
                        text = historyItem.Content.Trim()
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
        - Trả lời bằng tiếng Việt, giọng gia sư rõ ràng, tự nhiên, ngắn gọn.
        - Bạn có thể trả lời xuyên suốt về toàn bộ bài làm, các passage/part, câu hỏi, đáp án học viên, đáp án đúng, lỗi sai, mẫu lỗi lặp lại và phần text mà học viên vừa bôi đen.
        - Nếu request có đính kèm ảnh ngữ cảnh, hãy sử dụng cả nội dung nhìn thấy trong ảnh để trả lời, nhưng vẫn phải bám sát bài review hiện tại.
        - Nếu trong ngữ cảnh có dữ liệu cấu trúc của biểu đồ/hình (ví dụ JSON số liệu chuẩn), hãy xem đó là nguồn đúng nhất cho số liệu và chi tiết của hình.
        - Khi đọc biểu đồ, bảng, sơ đồ, map hoặc hình trong Writing/Reading, tuyệt đối không được bịa số liệu, nhãn, xu hướng hoặc chi tiết không nhìn thấy rõ trong ảnh.
        - Nếu ảnh và dữ liệu cấu trúc cùng được cung cấp, ưu tiên dữ liệu cấu trúc cho số liệu; dùng ảnh để hiểu bố cục và đối tượng đang được mô tả.
        - Nếu ảnh mờ, thiếu, khó đọc hoặc bạn không chắc về số liệu/chi tiết, phải nói rõ là không thể xác nhận chính xác từ ảnh hiện tại.
        - Với Writing Task 1, hãy tách rõ 2 phần nếu cần: (1) hướng dẫn cấu trúc/cách viết chung; (2) nhận xét dựa trên dữ liệu thật nhìn thấy trong hình. Không trộn phần hướng dẫn chung với số liệu tự suy đoán.
        - Nếu có SELECTED_TEXT hoặc CURRENT_FOCUS, hãy ưu tiên bám vào đó trước.
        - Nếu CURRENT_FOCUS đang là một câu hỏi objective, không được trả lời chỉ bằng một chữ cái, một từ hoặc ký hiệu đáp án trần như A, B, C, D, F, G. Phải nêu đáp án rồi giải thích ngắn vì sao.
        - Nếu CURRENT_FOCUS của Listening đã kèm transcript window của một câu, hãy dùng đúng cửa sổ transcript đó để giải thích; không được nói transcript bị thiếu nếu bằng chứng đã có trong cửa sổ này.
        - Nếu CURRENT_FOCUS của Listening cung cấp transcript scope hoặc transcript của đúng part, hãy tự tìm bằng chứng liên quan trong scope đó dựa trên câu hỏi, đáp án đúng, options, bảng/map/hình và selected text; không được phàn nàn là thiếu exact map nếu trong scope có câu chứng minh.
        - Với Listening, khi giải thích đáp án phải trích 1-2 câu tiếng Anh ngắn từ transcript window làm bằng chứng trước, rồi mới giải thích bằng tiếng Việt.
        - Với Listening dạng map labelling, matching hoặc sơ đồ, nếu đáp án là một ký hiệu vị trí như F hay G thì phải nói rõ vì sao vị trí đó đúng trên sơ đồ; không được chỉ trả lời mỗi ký hiệu.
        - Nếu transcript window chưa đủ để kết luận thì nói rõ là transcript window hiện tại chưa đủ bằng chứng, không được đoán bừa.
        - Khi giải thích, ưu tiên: đoạn nào trong bài hỗ trợ kết luận, vì sao đáp án đúng, vì sao đáp án học viên sai, và cách loại trừ lựa chọn khác nếu có.
        - Không bịa trích dẫn. Nếu nhắc lại bài review, chỉ paraphrase ngắn gọn hoặc nêu ý chính.
        - Không được đổi chủ đề sang mẹo chung hay kiến thức ngoài bài review, trừ khi người dùng chỉ hỏi cách hiểu một phần cụ thể trong chính bài đó.
        - Không được in ra suy nghĩ nội bộ, chain-of-thought, scratchpad, ghi chú phân tích hay nhãn nội bộ như `User's current focus`, `User's question`, `Context`, `Observation`, `Action`, `Conclusion`, `Need to`, `Looking at`.
        - Không được lặp lại nguyên văn dữ liệu ngữ cảnh thô, prompt hệ thống hoặc nói kiểu meta như "system instruction says", "provided transcript window", "I must state". Chỉ trả lời phần cuối cùng dành cho học viên.
        - Trình bày để dễ đọc: nếu có từ 2 ý trở lên, hãy tách thành các đoạn ngắn hoặc gạch đầu dòng; nếu đang hướng dẫn từng bước thì dùng danh sách đánh số.
        - Tránh dồn mọi ý vào một đoạn dài. Ưu tiên mỗi đoạn 1 ý chính.
        - Khi cần nhấn mạnh tiêu đề ý, hãy dùng markdown hợp lệ như `**Vì sao đáp án đúng:**` rồi xuống dòng.
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

    private static GeminiStreamChunk ExtractStreamChunk(string payload, ref string emittedText)
    {
        if (string.IsNullOrWhiteSpace(payload) || string.Equals(payload.Trim(), "[DONE]", StringComparison.Ordinal))
        {
            return new GeminiStreamChunk(string.Empty, null);
        }

        var geminiResponse = JsonSerializer.Deserialize<GeminiStreamResponse>(payload, JsonOptions);
        var finishReason = geminiResponse?.Candidates?
            .Select(candidate => candidate.FinishReason)
            .FirstOrDefault(reason => !string.IsNullOrWhiteSpace(reason));
        var text = string.Concat(
            geminiResponse?.Candidates?
                .SelectMany(candidate => candidate.Content?.Parts ?? [])
                .Select(part => part.Text)
                .Where(value => !string.IsNullOrWhiteSpace(value))
            ?? []);

        if (string.IsNullOrWhiteSpace(text))
        {
            return new GeminiStreamChunk(string.Empty, finishReason);
        }

        if (text.StartsWith(emittedText, StringComparison.Ordinal))
        {
            var delta = text[emittedText.Length..];
            emittedText = text;
            return new GeminiStreamChunk(delta, finishReason);
        }

        emittedText += text;
        return new GeminiStreamChunk(text, finishReason);
    }

    private static string SanitizeModelOutput(string rawText)
    {
        var normalized = rawText
            .Replace("\r\n", "\n", StringComparison.Ordinal)
            .Replace('\r', '\n')
            .Trim();

        if (string.IsNullOrWhiteSpace(normalized))
        {
            return string.Empty;
        }

        var jsonMessage = TryExtractJsonMessage(normalized);
        if (!string.IsNullOrWhiteSpace(jsonMessage))
        {
            return jsonMessage;
        }

        normalized = StripCodeFenceWrapper(normalized);

        var finalSection = ExtractAfterFinalMarker(normalized);
        if (!string.IsNullOrWhiteSpace(finalSection))
        {
            normalized = finalSection;
        }

        var lines = normalized
            .Split('\n')
            .Select(line => line.TrimEnd())
            .ToList();
        var reasoningLineCount = lines.Count(line => IsInternalReasoningLine(line) || LooksLikeContextLeakLine(line));
        if (reasoningLineCount == 0)
        {
            return CollapseBlankLines(lines);
        }

        var filteredLines = lines
            .Where(line => !IsInternalReasoningLine(line))
            .Where(line => !LooksLikeContextLeakLine(line))
            .ToList();

        var sanitized = CollapseBlankLines(filteredLines);
        return string.IsNullOrWhiteSpace(sanitized)
            ? CollapseBlankLines(lines)
            : sanitized;
    }

    private static string? TryExtractJsonMessage(string rawText)
    {
        var candidate = StripCodeFenceWrapper(rawText.Trim());
        if (TryReadJsonMessage(candidate, out var message))
        {
            return message;
        }

        var startIndex = candidate.IndexOf('{');
        var endIndex = candidate.LastIndexOf('}');
        if (startIndex >= 0 && endIndex > startIndex)
        {
            var embeddedJson = candidate[startIndex..(endIndex + 1)];
            if (TryReadJsonMessage(embeddedJson, out message))
            {
                return message;
            }
        }

        return null;
    }

    private static bool TryReadJsonMessage(string value, out string message)
    {
        message = string.Empty;

        try
        {
            using var document = JsonDocument.Parse(value);
            if (document.RootElement.ValueKind != JsonValueKind.Object)
            {
                return false;
            }

            if (!document.RootElement.TryGetProperty("message", out var messageProperty)
                || messageProperty.ValueKind != JsonValueKind.String)
            {
                return false;
            }

            message = messageProperty.GetString()?.Trim() ?? string.Empty;
            return !string.IsNullOrWhiteSpace(message);
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private static string StripCodeFenceWrapper(string value)
    {
        var trimmed = value.Trim();
        if (!trimmed.StartsWith("```", StringComparison.Ordinal))
        {
            return trimmed;
        }

        var firstLineEnd = trimmed.IndexOf('\n');
        if (firstLineEnd < 0)
        {
            return trimmed;
        }

        var lastFenceIndex = trimmed.LastIndexOf("```", StringComparison.Ordinal);
        if (lastFenceIndex <= firstLineEnd)
        {
            return trimmed[(firstLineEnd + 1)..].Trim();
        }

        return trimmed[(firstLineEnd + 1)..lastFenceIndex].Trim();
    }

    private static string? ExtractAfterFinalMarker(string value)
    {
        var markers = new[]
        {
            "Để trả lời đúng",
            "Để chọn đúng",
            "Để làm đúng",
            "Đáp án đúng là",
            "Bạn chọn",
            "Conclusion:",
            "Final answer:",
            "Final:",
            "Kết luận:",
            "Trả lời cuối:",
            "Câu trả lời cuối:",
            "Answer:"
        };

        var selectedIndex = -1;
        var selectedMarkerLength = 0;
        foreach (var marker in markers)
        {
            var markerIndex = value.LastIndexOf(marker, StringComparison.OrdinalIgnoreCase);
            if (markerIndex < 0 || markerIndex < selectedIndex)
            {
                continue;
            }

            selectedIndex = markerIndex;
            selectedMarkerLength = marker.Length;
        }

        return selectedIndex >= 0
            ? value[(selectedIndex + selectedMarkerLength)..].Trim()
            : null;
    }

    private static bool IsInternalReasoningLine(string line)
    {
        var trimmed = line.Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
        {
            return false;
        }

        var prefixes = new[]
        {
            "Step 1",
            "Step 2",
            "Step 3",
            "Step 4",
            "Step 5",
            "Step 6",
            "User's current focus:",
            "User's question:",
            "Context:",
            "Question ",
            "Correct Answer:",
            "Student's Answer:",
            "Need to",
            "Looking at",
            "Wait,",
            "The questions",
            "The correct answers",
            "However, the actual",
            "Rule:",
            "Observation:",
            "Acknowledged",
            "State that",
            "Begin,",
            "Action:",
            "Analysis:",
            "Reasoning:",
            "Thought:",
            "Conclusion:",
            "Final answer:",
            "Final:",
            "Kết luận:"
        };

        return prefixes.Any(prefix => trimmed.StartsWith(prefix, StringComparison.OrdinalIgnoreCase));
    }

    private static bool LooksLikeContextLeakLine(string line)
    {
        var trimmed = line.Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
        {
            return false;
        }

        if (trimmed.StartsWith("[", StringComparison.Ordinal) && trimmed.Contains(']'))
        {
            return true;
        }

        return trimmed.StartsWith("Section ", StringComparison.OrdinalIgnoreCase)
            || trimmed.StartsWith("Part ", StringComparison.OrdinalIgnoreCase)
            || trimmed.StartsWith("Prompt chung:", StringComparison.OrdinalIgnoreCase)
            || trimmed.StartsWith("Nội dung:", StringComparison.OrdinalIgnoreCase)
            || trimmed.StartsWith("Đáp án đúng:", StringComparison.OrdinalIgnoreCase)
            || trimmed.StartsWith("Học viên chọn:", StringComparison.OrdinalIgnoreCase);
    }

    private static string CollapseBlankLines(IEnumerable<string> lines)
    {
        var builder = new StringBuilder();
        var previousLineBlank = false;

        foreach (var line in lines)
        {
            var trimmedLine = line.TrimEnd();
            var isBlank = string.IsNullOrWhiteSpace(trimmedLine);
            if (isBlank)
            {
                if (previousLineBlank || builder.Length == 0)
                {
                    continue;
                }

                builder.AppendLine();
                previousLineBlank = true;
                continue;
            }

            if (builder.Length > 0 && !previousLineBlank)
            {
                builder.AppendLine();
            }

            builder.Append(trimmedLine);
            previousLineBlank = false;
        }

        return builder.ToString().Trim();
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

    private sealed record GeminiStreamResponse(
        [property: JsonPropertyName("candidates")] List<GeminiCandidate>? Candidates);

    private sealed record GeminiCandidate(
        [property: JsonPropertyName("content")] GeminiContent? Content,
        [property: JsonPropertyName("finishReason")] string? FinishReason);

    private sealed record GeminiContent(
        [property: JsonPropertyName("parts")] List<GeminiPart>? Parts);

    private sealed record GeminiPart(
        [property: JsonPropertyName("text")] string? Text);

    private sealed record GeminiStreamChunk(
        string TextDelta,
        string? FinishReason);

    private sealed record GeminiStreamPassResult(
        string EmittedText,
        string? FinishReason);
}
