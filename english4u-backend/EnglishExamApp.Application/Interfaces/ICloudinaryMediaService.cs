namespace EnglishExamApp.Application.Interfaces;

public interface ICloudinaryMediaService
{
    /// <summary>
    /// Uploads a file stream directly with signed signature.
    /// </summary>
    Task<string?> UploadAsync(
        Stream fileStream,
        string fileName,
        string folder,
        string account = "main",
        string resourceType = "auto",
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Deletes a single media file (either Cloudinary URL or local /uploads/ URL).
    /// </summary>
    Task<bool> DeleteMediaAsync(
        string? urlOrPublicId,
        string account = "main",
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Deletes multiple media files (either Cloudinary URLs or local /uploads/ URLs).
    /// </summary>
    Task<int> DeleteMediaListAsync(
        IEnumerable<string?> urlsOrPublicIds,
        string account = "main",
        CancellationToken cancellationToken = default);
}

