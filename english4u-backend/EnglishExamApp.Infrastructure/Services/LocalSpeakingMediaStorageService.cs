using System.Globalization;
using EnglishExamApp.Application.Interfaces;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Hosting;

namespace EnglishExamApp.Infrastructure.Services;

public sealed class LocalSpeakingMediaStorageService(
    IHostEnvironment hostEnvironment,
    IHttpContextAccessor httpContextAccessor) : ISpeakingMediaStorageService
{
    private const string UploadRootFolder = "uploads";

    public async Task<StoredSpeakingMediaDto> SaveAsync(
        Guid sessionId,
        Guid speakingQuestionId,
        string originalFileName,
        Stream content,
        CancellationToken cancellationToken = default)
    {
        return await SaveFileAsync(
            new[]
            {
                "speaking",
                sessionId.ToString("N", CultureInfo.InvariantCulture),
                speakingQuestionId.ToString("N", CultureInfo.InvariantCulture),
            },
            ".webm",
            originalFileName,
            content,
            cancellationToken);
    }

    public async Task<StoredSpeakingMediaDto> SavePromptAsync(
        string originalFileName,
        Stream content,
        CancellationToken cancellationToken = default)
    {
        return await SaveFileAsync(
            new[]
            {
                "speaking-prompts",
                DateTime.UtcNow.ToString("yyyyMMdd", CultureInfo.InvariantCulture),
            },
            ".mp3",
            originalFileName,
            content,
            cancellationToken);
    }

    private async Task<StoredSpeakingMediaDto> SaveFileAsync(
        IReadOnlyList<string> relativeSegments,
        string defaultExtension,
        string originalFileName,
        Stream content,
        CancellationToken cancellationToken)
    {
        var safeExtension = GetSafeExtension(originalFileName, defaultExtension);
        var fileName = $"{DateTime.UtcNow:yyyyMMddHHmmssfff}-{Guid.NewGuid():N}{safeExtension}";
        var folderPath = Path.Combine(new[] { hostEnvironment.ContentRootPath, UploadRootFolder }.Concat(relativeSegments).ToArray());
        Directory.CreateDirectory(folderPath);

        var filePath = Path.Combine(folderPath, fileName);
        await using (var fileStream = new FileStream(filePath, FileMode.Create, FileAccess.Write, FileShare.None))
        {
            await content.CopyToAsync(fileStream, cancellationToken);
        }

        var fileInfo = new FileInfo(filePath);
        var fileSizeKB = Math.Max(1, (int)Math.Ceiling(fileInfo.Length / 1024d));
        var relativeUrl = "/" + string.Join("/", new[] { UploadRootFolder }.Concat(relativeSegments).Append(fileName));
        var request = httpContextAccessor.HttpContext?.Request;
        var absoluteUrl = request is null
            ? relativeUrl
            : $"{request.Scheme}://{request.Host}{relativeUrl}";

        return new StoredSpeakingMediaDto(absoluteUrl, fileSizeKB);
    }

    private static string GetSafeExtension(string originalFileName, string defaultExtension)
    {
        var extension = Path.GetExtension(originalFileName);
        if (string.IsNullOrWhiteSpace(extension) || extension.Length > 16)
        {
            return defaultExtension;
        }

        var safeExtension = new string(extension
            .Where(character => char.IsLetterOrDigit(character) || character == '.')
            .ToArray());

        return safeExtension.StartsWith(".", StringComparison.Ordinal)
            ? safeExtension.ToLowerInvariant()
            : defaultExtension;
    }
}
