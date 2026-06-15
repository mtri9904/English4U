using System.Text.Json;

namespace EnglishExamApp.Infrastructure.Services;

internal static class AiServiceErrorDetailParser
{
    public static string? Extract(string? rawBody)
    {
        if (string.IsNullOrWhiteSpace(rawBody))
        {
            return null;
        }

        try
        {
            using var document = JsonDocument.Parse(rawBody);
            if (document.RootElement.ValueKind == JsonValueKind.Object)
            {
                if (document.RootElement.TryGetProperty("detail", out var detailElement)
                    && detailElement.ValueKind == JsonValueKind.String)
                {
                    return detailElement.GetString();
                }

                if (document.RootElement.TryGetProperty("message", out var messageElement)
                    && messageElement.ValueKind == JsonValueKind.String)
                {
                    return messageElement.GetString();
                }
            }
        }
        catch (JsonException)
        {
        }

        return rawBody.Trim();
    }
}
