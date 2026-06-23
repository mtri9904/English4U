using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Configuration;

namespace EnglishExamApp.Infrastructure.Services;

public interface IGeminiPdfNativeExtractionClient
{
    Task<string> ExtractExamJsonAsync(byte[] pdfBytes, string fileName, string prompt, CancellationToken cancellationToken);
}

public sealed class GeminiPdfNativeExtractionClient(
    HttpClient httpClient,
    IConfiguration configuration) : IGeminiPdfNativeExtractionClient
{
    private const string DefaultModel = "gemini-3.1-flash-lite";

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true,
        AllowTrailingCommas = true,
        ReadCommentHandling = JsonCommentHandling.Skip
    };

    private readonly string _apiKey = GeminiConfiguration.ResolveApiKey(
        configuration,
        "GeminiPdfNativeExtraction:ApiKey",
        "GemmaExamGeneration:ApiKey");

    private readonly string _model = configuration["GeminiPdfNativeExtraction:Model"] ?? DefaultModel;

    private readonly double _temperature =
        configuration.GetValue<double?>("GeminiPdfNativeExtraction:Temperature") ??
        configuration.GetValue<double?>("GemmaExamGeneration:Temperature") ??
        0.0d;

    private readonly int _maxOutputTokens = Math.Clamp(
        configuration.GetValue<int?>("GeminiPdfNativeExtraction:MaxOutputTokens") ??
        65536,
        8192,
        65536);

    public async Task<string> ExtractExamJsonAsync(
        byte[] pdfBytes,
        string fileName,
        string prompt,
        CancellationToken cancellationToken)
    {
        var temperatures = new[] { _temperature, 0.3d, 0.6d };
        for (int i = 0; i < temperatures.Length; i++)
        {
            try
            {
                return await ExtractExamJsonInternalAsync(pdfBytes, fileName, prompt, temperatures[i], cancellationToken);
            }
            catch (InvalidOperationException ex) when (
                ex.Message.Contains("Finish reason: RECITATION") || 
                ex.Message.Contains("MAX_TOKENS"))
            {
                if (i == temperatures.Length - 1)
                {
                    throw;
                }
            }
        }
        throw new InvalidOperationException($"Gemini native PDF extraction failed for {fileName} due to persistent RECITATION blocks.");
    }

    private async Task<string> ExtractExamJsonInternalAsync(
        byte[] pdfBytes,
        string fileName,
        string prompt,
        double temperature,
        CancellationToken cancellationToken)
    {
        if (pdfBytes.Length == 0)
        {
            throw new InvalidOperationException("Uploaded PDF is empty.");
        }

        if (string.IsNullOrWhiteSpace(_apiKey))
        {
            throw new InvalidOperationException("GeminiPdfNativeExtraction:ApiKey is missing.");
        }

        var requestPayload = new GeminiGenerateContentRequest(
            Contents:
            [
                new GeminiContent(
                    Parts:
                    [
                        new GeminiPart(
                            Text: null,
                            InlineData: new GeminiInlineData(
                                MimeType: "application/pdf",
                                Data: Convert.ToBase64String(pdfBytes))),
                        new GeminiPart(
                            Text: prompt,
                            InlineData: null)
                    ])
            ],
            GenerationConfig: new GeminiGenerationConfig(
                Temperature: temperature,
                MaxOutputTokens: _maxOutputTokens,
                ResponseMimeType: "application/json"));

        var requestUri = $"v1beta/models/{Uri.EscapeDataString(_model)}:generateContent?key={Uri.EscapeDataString(_apiKey)}";
        using var response = await httpClient.PostAsJsonAsync(requestUri, requestPayload, JsonOptions, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"Gemini native PDF extraction failed with status {(int)response.StatusCode}: {body}");
        }

        var geminiResponse = JsonSerializer.Deserialize<GeminiGenerateContentResponse>(body, JsonOptions);
        var firstCandidate = geminiResponse?.Candidates?.FirstOrDefault();
        var finishReason = firstCandidate?.FinishReason;
        var text = firstCandidate?.Content?.Parts?
            .FirstOrDefault(part => !string.IsNullOrWhiteSpace(part.Text))?.Text;
        if (string.IsNullOrWhiteSpace(text))
        {
            throw new InvalidOperationException(
                $"Gemini native PDF extraction returned empty text for {fileName}. Finish reason: {finishReason}. Response: {body}");
        }

        if (string.Equals(finishReason, "MAX_TOKENS", StringComparison.OrdinalIgnoreCase))
        {
            try
            {
                var debugDir = @"c:\Users\Hande\OneDrive\Documents\DoAnTotNghiep\English4U\english4u-backend\scratch_debug";
                Directory.CreateDirectory(debugDir);
                var debugPath = Path.Combine(debugDir, $"truncated_output_{DateTime.UtcNow:yyyyMMdd_HHmmss}.json");
                File.WriteAllText(debugPath, text);
                Console.WriteLine($"[DEBUG-LLM] Truncated output saved to {debugPath}. Length: {text.Length} characters.");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DEBUG-LLM] Failed to save truncated output: {ex.Message}");
            }

            throw new InvalidOperationException(
                $"Gemini native PDF extraction output was truncated (MAX_TOKENS) for {fileName}. The PDF may be too long for a single request. Will retry per passage.");
        }

        return StripJsonFence(text);
    }

    private static string StripJsonFence(string value)
    {
        var trimmed = value.Trim();
        if (!trimmed.StartsWith("```", StringComparison.Ordinal))
        {
            return trimmed;
        }

        var firstNewLine = trimmed.IndexOf('\n');
        if (firstNewLine >= 0)
        {
            trimmed = trimmed[(firstNewLine + 1)..].Trim();
        }

        if (trimmed.EndsWith("```", StringComparison.Ordinal))
        {
            trimmed = trimmed[..^3].Trim();
        }

        return trimmed.Trim();
    }

    private sealed record GeminiGenerateContentRequest(
        [property: JsonPropertyName("contents")] IReadOnlyList<GeminiContent> Contents,
        [property: JsonPropertyName("generationConfig")] GeminiGenerationConfig GenerationConfig);

    private sealed record GeminiContent(
        [property: JsonPropertyName("parts")] IReadOnlyList<GeminiPart> Parts);

    private sealed record GeminiPart(
        [property: JsonPropertyName("text")] string? Text,
        [property: JsonPropertyName("inline_data")] GeminiInlineData? InlineData);

    private sealed record GeminiInlineData(
        [property: JsonPropertyName("mime_type")] string MimeType,
        [property: JsonPropertyName("data")] string Data);

    private sealed record GeminiGenerationConfig(
        [property: JsonPropertyName("temperature")] double Temperature,
        [property: JsonPropertyName("maxOutputTokens")] int MaxOutputTokens,
        [property: JsonPropertyName("responseMimeType")] string ResponseMimeType);

    private sealed record GeminiGenerateContentResponse(
        [property: JsonPropertyName("candidates")] List<GeminiCandidate>? Candidates);

    private sealed record GeminiCandidate(
        [property: JsonPropertyName("content")] GeminiContent? Content,
        [property: JsonPropertyName("finishReason")] string? FinishReason);
}
