namespace EnglishExamApp.Infrastructure.Services;

internal static class SpeakingAudioUploadMetadata
{
    private const string DefaultFileName = "recording.webm";

    public static string GetFileName(string? audioUrl)
    {
        if (string.IsNullOrWhiteSpace(audioUrl))
        {
            return DefaultFileName;
        }

        if (!Uri.TryCreate(audioUrl, UriKind.Absolute, out var uri))
        {
            return DefaultFileName;
        }

        var fileName = Path.GetFileName(uri.LocalPath);
        return string.IsNullOrWhiteSpace(fileName) ? DefaultFileName : fileName;
    }

    public static string GetContentType(string fileName) =>
        Path.GetExtension(fileName).ToLowerInvariant() switch
        {
            ".webm" => "audio/webm",
            ".wav" => "audio/wav",
            ".mp3" => "audio/mpeg",
            ".m4a" => "audio/mp4",
            ".ogg" => "audio/ogg",
            _ => "application/octet-stream"
        };
}
