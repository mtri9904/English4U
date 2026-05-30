using System.Globalization;
using System.Text.RegularExpressions;

namespace EnglishExamApp.Infrastructure.Services;

internal static partial class GemmaApiRetryDelayResolver
{
    private const int RateLimitFallbackDelayMs = 5000;
    private const int TransientErrorFallbackDelayMs = 5000;

    public static bool TryResolve(Exception exception, out TimeSpan retryDelay, out string reason)
    {
        retryDelay = TimeSpan.Zero;
        reason = string.Empty;

        if (exception is not InvalidOperationException invalidOperationException)
        {
            return false;
        }

        var message = invalidOperationException.Message;
        if (message.Contains("status 429", StringComparison.OrdinalIgnoreCase) ||
            message.Contains("\"status\": \"RESOURCE_EXHAUSTED\"", StringComparison.OrdinalIgnoreCase))
        {
            reason = "Vượt quota token/phút của Gemini";
            retryDelay = TryExtractRetryDelayFromMessage(message, out var parsedDelay)
                ? parsedDelay
                : TimeSpan.FromMilliseconds(RateLimitFallbackDelayMs);
            return true;
        }

        if (message.Contains("status 500", StringComparison.OrdinalIgnoreCase) ||
            message.Contains("status 502", StringComparison.OrdinalIgnoreCase) ||
            message.Contains("status 503", StringComparison.OrdinalIgnoreCase) ||
            message.Contains("status 504", StringComparison.OrdinalIgnoreCase) ||
            message.Contains("\"status\": \"INTERNAL\"", StringComparison.OrdinalIgnoreCase) ||
            message.Contains("\"status\": \"UNAVAILABLE\"", StringComparison.OrdinalIgnoreCase) ||
            message.Contains("\"status\": \"DEADLINE_EXCEEDED\"", StringComparison.OrdinalIgnoreCase))
        {
            reason = "Lỗi tạm thời từ Gemini API";
            retryDelay = TimeSpan.FromMilliseconds(TransientErrorFallbackDelayMs);
            return true;
        }

        return false;
    }

    private static bool TryExtractRetryDelayFromMessage(string message, out TimeSpan retryDelay)
    {
        retryDelay = TimeSpan.Zero;

        var retryInMatch = RetryInSecondsRegex().Match(message);
        if (retryInMatch.Success &&
            double.TryParse(retryInMatch.Groups["seconds"].Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var retryInSeconds))
        {
            retryDelay = TimeSpan.FromSeconds(Math.Clamp(retryInSeconds + 0.5d, 1d, 90d));
            return true;
        }

        var retryDelayMatch = RetryDelaySecondsRegex().Match(message);
        if (retryDelayMatch.Success &&
            double.TryParse(retryDelayMatch.Groups["seconds"].Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var retryDelaySeconds))
        {
            retryDelay = TimeSpan.FromSeconds(Math.Clamp(retryDelaySeconds + 0.5d, 1d, 90d));
            return true;
        }

        return false;
    }

    [GeneratedRegex(@"retry in\s*(?<seconds>\d+(?:\.\d+)?)s", RegexOptions.IgnoreCase)]
    private static partial Regex RetryInSecondsRegex();

    [GeneratedRegex("\"retryDelay\"\\s*:\\s*\"(?<seconds>\\d+(?:\\.\\d+)?)s\"", RegexOptions.IgnoreCase)]
    private static partial Regex RetryDelaySecondsRegex();
}
