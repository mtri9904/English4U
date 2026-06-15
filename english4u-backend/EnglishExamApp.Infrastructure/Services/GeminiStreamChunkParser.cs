using System.Text.Json;
using System.Text.Json.Serialization;

namespace EnglishExamApp.Infrastructure.Services;

internal static class GeminiStreamChunkParser
{
    public static GeminiStreamChunk Extract(
        string payload,
        ref string emittedText,
        JsonSerializerOptions jsonOptions)
    {
        if (string.IsNullOrWhiteSpace(payload) || string.Equals(payload.Trim(), "[DONE]", StringComparison.Ordinal))
        {
            return new GeminiStreamChunk(string.Empty, null);
        }

        var geminiResponse = JsonSerializer.Deserialize<GeminiStreamResponse>(payload, jsonOptions);
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

    private sealed record GeminiStreamResponse(
        [property: JsonPropertyName("candidates")] List<GeminiCandidate>? Candidates);

    private sealed record GeminiCandidate(
        [property: JsonPropertyName("content")] GeminiContent? Content,
        [property: JsonPropertyName("finishReason")] string? FinishReason);

    private sealed record GeminiContent(
        [property: JsonPropertyName("parts")] List<GeminiPart>? Parts);

    private sealed record GeminiPart(
        [property: JsonPropertyName("text")] string? Text);
}

internal sealed record GeminiStreamChunk(
    string TextDelta,
    string? FinishReason);
