using Microsoft.Extensions.Configuration;

namespace EnglishExamApp.Infrastructure.Services;

internal static class GeminiConfiguration
{
    private static readonly string[] SharedApiKeyKeys =
    [
        "GEMINI_API_KEY",
        "GemmaExamGeneration:ApiKey",
        "GeminiScoring:ApiKey",
        "GeminiCopilot:ApiKey",
        "GeminiVisualExtraction:ApiKey"
    ];

    public static string ResolveApiKey(IConfiguration configuration, params string[] preferredKeys)
    {
        foreach (var key in preferredKeys.Concat(SharedApiKeyKeys).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            var value = configuration[key];
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value;
            }
        }

        return string.Empty;
    }

    public static string BuildMissingApiKeyMessage(string serviceName, params string[] preferredKeys)
    {
        var keys = preferredKeys
            .Concat(SharedApiKeyKeys)
            .Distinct(StringComparer.OrdinalIgnoreCase);

        return $"{serviceName} API key is missing. Configure one of: {string.Join(", ", keys)}.";
    }
}
