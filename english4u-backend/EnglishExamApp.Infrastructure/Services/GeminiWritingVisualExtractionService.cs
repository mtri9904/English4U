using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using EnglishExamApp.Application.DTOs.Exams;
using EnglishExamApp.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace EnglishExamApp.Infrastructure.Services;

public sealed class GeminiWritingVisualExtractionService(
    HttpClient httpClient,
    IConfiguration configuration,
    ILogger<GeminiWritingVisualExtractionService> logger) : IWritingVisualExtractionService
{
    private const string DefaultModel = "gemini-2.5-flash";
    private const string DefaultFallbackModel = "gemini-2.5-flash-lite";
    private const int DefaultMaxImageBytes = 4 * 1024 * 1024;

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly string _apiKey = FirstNonEmpty(
        configuration["GeminiVisualExtraction:ApiKey"],
        configuration["GeminiScoring:ApiKey"],
        configuration["GeminiCopilot:ApiKey"],
        configuration["GEMINI_API_KEY"],
        configuration["GemmaExamGeneration:ApiKey"]);

    private readonly string _baseUrl = FirstNonEmpty(
        configuration["GeminiVisualExtraction:BaseUrl"],
        configuration["GeminiScoring:BaseUrl"],
        "https://generativelanguage.googleapis.com").TrimEnd('/');

    private readonly string[] _modelCandidates = BuildModelCandidates(configuration);
    private readonly double _temperature = configuration.GetValue<double?>("GeminiVisualExtraction:Temperature") ?? 0.1d;
    private readonly int _maxImageBytes = configuration.GetValue<int?>("GeminiVisualExtraction:MaxImageBytes") ?? DefaultMaxImageBytes;

    public async Task<ExtractWritingVisualDataResponseDto> ExtractAsync(
        ExtractWritingVisualDataRequestDto request,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.ImageUrl))
        {
            throw new InvalidOperationException("Image URL is required.");
        }

        if (string.IsNullOrWhiteSpace(_apiKey))
        {
            throw new InvalidOperationException("Gemini visual extraction API key is missing.");
        }

        var imagePart = await TryBuildInlineImagePartAsync(request.ImageUrl.Trim(), cancellationToken);
        if (imagePart is null)
        {
            throw new InvalidOperationException("Không thể tải hoặc xử lý ảnh biểu đồ để AI đọc.");
        }

        string? lastError = null;

        foreach (var model in _modelCandidates)
        {
            var requestData = new
            {
                contents = new[]
                {
                    new
                    {
                        role = "user",
                        parts = new object[]
                        {
                            new
                            {
                                text = BuildPrompt(request.PromptText)
                            },
                            imagePart
                        }
                    }
                },
                generationConfig = new
                {
                    temperature = _temperature,
                    responseMimeType = "application/json"
                }
            };

            using var response = await PostGenerateContentAsync(model, requestData, cancellationToken);
            var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                lastError = responseBody;
                logger.LogWarning(
                    "Gemini visual extraction model {Model} failed with status {StatusCode}. Body: {Body}",
                    model,
                    (int)response.StatusCode,
                    responseBody);

                if (ShouldTryNextModel(response.StatusCode))
                {
                    continue;
                }

                throw new InvalidOperationException($"AI đọc biểu đồ thất bại với status {(int)response.StatusCode}: {responseBody}");
            }

            var rawJson = ExtractResponseText(responseBody);
            var normalizedJson = PrettyPrintJson(rawJson);
            return new ExtractWritingVisualDataResponseDto(normalizedJson, model);
        }

        throw new InvalidOperationException($"AI đọc biểu đồ thất bại: {lastError ?? "Không có phản hồi từ model."}");
    }

    private async Task<HttpResponseMessage> PostGenerateContentAsync(
        string model,
        object requestData,
        CancellationToken cancellationToken)
    {
        var requestUrl = $"{_baseUrl}/v1beta/models/{Uri.EscapeDataString(model)}:generateContent";
        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, requestUrl)
        {
            Content = JsonContent.Create(requestData, options: JsonOptions)
        };
        httpRequest.Headers.TryAddWithoutValidation("x-goog-api-key", _apiKey);

        return await httpClient.SendAsync(httpRequest, cancellationToken);
    }

    private async Task<object?> TryBuildInlineImagePartAsync(string imageUrl, CancellationToken cancellationToken)
    {
        if (!Uri.TryCreate(imageUrl, UriKind.Absolute, out var uri))
        {
            return null;
        }

        try
        {
            using var response = await httpClient.GetAsync(uri, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return null;
            }

            var mimeType = response.Content.Headers.ContentType?.MediaType?.Trim()?.ToLowerInvariant();
            if (mimeType is not ("image/png" or "image/jpeg" or "image/jpg" or "image/webp" or "image/gif" or "image/bmp"))
            {
                return null;
            }

            var bytes = await response.Content.ReadAsByteArrayAsync(cancellationToken);
            if (bytes.Length == 0 || bytes.Length > _maxImageBytes)
            {
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
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to fetch writing visual image {ImageUrl}.", imageUrl);
            return null;
        }
    }

    private static string BuildPrompt(string? promptText) =>
        $$"""
        You are extracting reliable structured data from an IELTS Writing Task 1 visual.

        Rules:
        - Read the chart, graph, table, map, or diagram carefully.
        - Extract only what is clearly visible or confidently inferable from labels and readable values.
        - Do not guess exact numbers from bar heights, line positions, or spacing if they are not clearly readable.
        - If a value is unclear, set the numeric field to null and explain the uncertainty in notes.
        - Prefer precision over completeness.
        - Return JSON only.

        If prompt text is available, use it to understand the task and labels:
        {{promptText?.Trim() ?? "No prompt text provided."}}

        Return this schema:
        {
          "chart_type": "bar_chart | line_graph | pie_chart | table | process | map | mixed | other",
          "title": "short title if visible",
          "unit": "unit if visible, else null",
          "overview": "1-2 câu tiếng Việt tóm tắt xu hướng/chênh lệch chính nhìn thấy rõ",
          "categories": ["..."],
          "series": ["..."],
          "data_points": [
            {
              "category": "x-axis item / table row / stage",
              "series": "legend/line/bar name if any",
              "value": 123,
              "value_text": "exact visible text if present",
              "approximate": false,
              "notes": "ghi chú nếu giá trị không chắc hoặc chỉ đọc được một phần"
            }
          ],
          "key_features": [
            "Các đặc điểm chính nhìn thấy rõ"
          ],
          "uncertain_areas": [
            "Nêu phần nào trong hình mờ/khó đọc/không chắc"
          ]
        }
        """;

    private static string ExtractResponseText(string responseBody)
    {
        var geminiResponse = JsonSerializer.Deserialize<GeminiGenerateContentResponse>(responseBody, JsonOptions);
        var rawText = geminiResponse?.Candidates?
            .FirstOrDefault()?.Content?.Parts?
            .FirstOrDefault(part => !string.IsNullOrWhiteSpace(part.Text))?.Text;

        if (string.IsNullOrWhiteSpace(rawText))
        {
            throw new InvalidOperationException("AI đọc biểu đồ trả về nội dung rỗng.");
        }

        return rawText.Trim();
    }

    private static string PrettyPrintJson(string rawJson)
    {
        try
        {
            using var document = JsonDocument.Parse(rawJson);
            return JsonSerializer.Serialize(document.RootElement, new JsonSerializerOptions { WriteIndented = true });
        }
        catch
        {
            return rawJson;
        }
    }

    private static bool ShouldTryNextModel(HttpStatusCode statusCode) =>
        statusCode is HttpStatusCode.NotFound
            or HttpStatusCode.TooManyRequests
            or HttpStatusCode.InternalServerError
            or HttpStatusCode.BadGateway
            or HttpStatusCode.ServiceUnavailable
            or HttpStatusCode.GatewayTimeout;

    private static string[] BuildModelCandidates(IConfiguration configuration)
    {
        var configuredPrimary = configuration["GeminiVisualExtraction:Model"];
        var configuredFallbacks = configuration
            .GetSection("GeminiVisualExtraction:FallbackModels")
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

    private static string FirstNonEmpty(params string?[] values) =>
        values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value))?.Trim() ?? string.Empty;

    private sealed record GeminiGenerateContentResponse(
        [property: JsonPropertyName("candidates")] List<GeminiCandidate>? Candidates);

    private sealed record GeminiCandidate(
        [property: JsonPropertyName("content")] GeminiContent? Content);

    private sealed record GeminiContent(
        [property: JsonPropertyName("parts")] List<GeminiPart>? Parts);

    private sealed record GeminiPart(
        [property: JsonPropertyName("text")] string? Text);
}
