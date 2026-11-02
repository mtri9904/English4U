using EnglishExamApp.API.Authentication;
using EnglishExamApp.Application.DTOs.Feedbacks;
using EnglishExamApp.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EnglishExamApp.API.Controllers;

[ApiController]
[Route("api/feedbacks")]
[Authorize]
public class FeedbackController(
    IFeedbackService feedbackService,
    ICurrentUserService currentUser,
    ICloudinaryMediaService cloudinaryMediaService,
    ILogger<FeedbackController> logger) : ControllerBase
{
    private static readonly HashSet<string> AllowedImageExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".png", ".jpg", ".jpeg", ".webp"
    };

    [HttpPost]
    public async Task<IResult> CreateFeedback(
        [FromBody] CreateFeedbackRequestDto dto,
        CancellationToken cancellationToken)
    {
        if (!currentUser.TryGetUserId(out var userId))
        {
            return TypedResults.Unauthorized();
        }

        if (string.IsNullOrWhiteSpace(dto.Title))
        {
            return TypedResults.BadRequest(new { message = "Tiêu đề không được để trống." });
        }

        if (string.IsNullOrWhiteSpace(dto.Description))
        {
            return TypedResults.BadRequest(new { message = "Mô tả chi tiết không được để trống." });
        }

        try
        {
            var result = await feedbackService.CreateFeedbackAsync(userId, dto, cancellationToken);
            return TypedResults.Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return TypedResults.BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("upload-image")]
    [RequestSizeLimit(15 * 1024 * 1024)]
    public async Task<IResult> UploadImage(IFormFile? file, CancellationToken cancellationToken)
    {
        if (file is null || file.Length == 0)
        {
            return TypedResults.BadRequest(new { message = "Vui lòng chọn hình ảnh cần tải lên." });
        }

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!AllowedImageExtensions.Contains(ext))
        {
            return TypedResults.BadRequest(new { message = "Chỉ chấp nhận định dạng ảnh PNG, JPG, JPEG, WEBP." });
        }

        if (file.Length > 10 * 1024 * 1024)
        {
            return TypedResults.BadRequest(new { message = "Dung lượng ảnh tối đa là 10MB." });
        }

        try
        {
            await using var stream = file.OpenReadStream();
            var cloudinaryUrl = await cloudinaryMediaService.UploadAsync(
                stream, file.FileName, "feedbacks", "feedback", "image", cancellationToken);

            if (!string.IsNullOrEmpty(cloudinaryUrl))
            {
                return TypedResults.Ok(new { url = cloudinaryUrl });
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to upload feedback image to Cloudinary.");
        }

        return TypedResults.BadRequest(new { message = "Không thể tải ảnh lên Cloudinary. Vui lòng kiểm tra cấu hình hoặc thử lại sau." });
    }

    [HttpGet("recent")]
    public async Task<IResult> GetRecentFeedbacks(
        [FromQuery] int limit = 30,
        CancellationToken cancellationToken = default)
    {
        var list = await feedbackService.GetRecentFeedbacksAsync(limit, cancellationToken);
        return TypedResults.Ok(list);
    }

    [HttpGet("my")]
    public async Task<IResult> GetMyFeedbacks(CancellationToken cancellationToken)
    {
        if (!currentUser.TryGetUserId(out var userId))
        {
            return TypedResults.Unauthorized();
        }

        var list = await feedbackService.GetMyFeedbacksAsync(userId, cancellationToken);
        return TypedResults.Ok(list);
    }

    [HttpGet("{id:guid}")]
    public async Task<IResult> GetFeedbackDetail(Guid id, CancellationToken cancellationToken)
    {
        var detail = await feedbackService.GetFeedbackDetailAsync(id, cancellationToken);
        if (detail is null)
        {
            return TypedResults.NotFound(new { message = "Không tìm thấy phản hồi." });
        }

        return TypedResults.Ok(detail);
    }
}
