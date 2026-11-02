using EnglishExamApp.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EnglishExamApp.API.Controllers;

[ApiController]
[Route("api/media")]
[Authorize]
public class MediaController(
    IConfiguration configuration,
    ICloudinaryMediaService cloudinaryMediaService,
    ILogger<MediaController> logger) : ControllerBase
{
    private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        // Images
        ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg",
        // Audio
        ".mp3", ".wav", ".ogg", ".m4a", ".webm", ".aac", ".flac",
        // Documents
        ".pdf"
    };

    [HttpPost("upload")]
    [RequestSizeLimit(50 * 1024 * 1024)]
    public async Task<IResult> Upload(
        IFormFile? file,
        [FromForm] string? folder = null,
        [FromForm] string? resourceType = "auto",
        CancellationToken cancellationToken = default)
    {
        if (file is null || file.Length == 0)
        {
            return TypedResults.BadRequest(new { message = "Vui lòng chọn tệp cần tải lên." });
        }

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!AllowedExtensions.Contains(ext))
        {
            return TypedResults.BadRequest(new { message = $"Định dạng tệp '{ext}' không được hỗ trợ." });
        }

        if (file.Length > 50 * 1024 * 1024)
        {
            return TypedResults.BadRequest(new { message = "Dung lượng tệp tối đa cho phép là 50MB." });
        }

        var targetFolder = string.IsNullOrWhiteSpace(folder)
            ? (configuration["CloudinaryMain:Folder"] ?? "english4u")
            : folder.Trim();

        var validResourceType = string.IsNullOrWhiteSpace(resourceType) ? "auto" : resourceType.Trim().ToLowerInvariant();
        if (validResourceType is not ("image" or "video" or "raw" or "auto"))
        {
            validResourceType = "auto";
        }

        try
        {
            await using var stream = file.OpenReadStream();
            var cloudinaryUrl = await cloudinaryMediaService.UploadAsync(
                stream, file.FileName, targetFolder, "main", validResourceType, cancellationToken);

            if (!string.IsNullOrEmpty(cloudinaryUrl))
            {
                return TypedResults.Ok(new
                {
                    url = cloudinaryUrl,
                    secureUrl = cloudinaryUrl,
                    fileName = file.FileName
                });
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to upload media to Cloudinary.");
        }

        return TypedResults.BadRequest(new { message = "Không thể tải tệp lên Cloudinary. Vui lòng kiểm tra cấu hình hoặc thử lại sau." });
    }

    [HttpDelete]
    public async Task<IResult> DeleteMedia([FromQuery] string url, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            return TypedResults.BadRequest(new { message = "URL không hợp lệ." });
        }

        var deleted = await cloudinaryMediaService.DeleteMediaAsync(url, "main", cancellationToken);
        return TypedResults.Ok(new { success = deleted });
    }
}
