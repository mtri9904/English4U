using System.Text.Json;
using System.Text.Json.Serialization;

namespace EnglishExamApp.Infrastructure.Services;

internal static class GeminiGenerateContentResponseParser
{
    public static AiScoreResponse? DeserializeScoreResponse(
        string responseBody,
        JsonSerializerOptions jsonOptions)
    {
        var geminiResponse = JsonSerializer.Deserialize<GeminiGenerateContentResponse>(responseBody, jsonOptions);
        var rawText = geminiResponse?.Candidates?
            .FirstOrDefault()?.Content?.Parts?
            .FirstOrDefault(part => !string.IsNullOrWhiteSpace(part.Text))?.Text;

        if (string.IsNullOrWhiteSpace(rawText))
        {
            throw new InvalidOperationException("Gemini writing scoring returned an empty response.");
        }

        var json = ExtractJsonObject(rawText);
        return JsonSerializer.Deserialize<AiScoreResponse>(json, jsonOptions);
    }

    private static string ExtractJsonObject(string value)
    {
        var trimmed = value.Trim();
        if (trimmed.StartsWith("```", StringComparison.Ordinal))
        {
            var firstNewLine = trimmed.IndexOf('\n');
            if (firstNewLine >= 0)
            {
                trimmed = trimmed[(firstNewLine + 1)..].Trim();
            }

            if (trimmed.EndsWith("```", StringComparison.Ordinal))
            {
                trimmed = trimmed[..^3].Trim();
            }
        }

        var start = trimmed.IndexOf('{');
        var end = trimmed.LastIndexOf('}');
        if (start < 0 || end <= start)
        {
            throw new InvalidOperationException("Gemini writing scoring did not return valid JSON.");
        }

        return trimmed[start..(end + 1)];
    }

    private sealed record GeminiGenerateContentResponse(
        [property: JsonPropertyName("candidates")] List<GeminiCandidate>? Candidates);

    private sealed record GeminiCandidate(
        [property: JsonPropertyName("content")] GeminiContent? Content);

    private sealed record GeminiContent(
        [property: JsonPropertyName("parts")] List<GeminiPart>? Parts);

    private sealed record GeminiPart(
        [property: JsonPropertyName("text")] string? Text);
}
