using EnglishExamApp.API.Authentication;
using EnglishExamApp.Application.DTOs.Feedbacks;
using EnglishExamApp.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EnglishExamApp.API.Controllers;

[ApiController]
[Route("api/admin/feedbacks")]
[Authorize(Roles = "Admin")]
public class AdminFeedbackController(
    IFeedbackService feedbackService,
    ICurrentUserService currentUser) : ControllerBase
{
    [HttpGet]
    public async Task<IResult> GetPagedFeedbacks(
        [FromQuery] FeedbackPagedRequest request,
        CancellationToken cancellationToken)
    {
        var result = await feedbackService.GetAdminPagedFeedbacksAsync(request, cancellationToken);
        return TypedResults.Ok(result);
    }

    [HttpGet("stats")]
    public async Task<IResult> GetStats(CancellationToken cancellationToken)
    {
        var stats = await feedbackService.GetFeedbackStatsAsync(cancellationToken);
        return TypedResults.Ok(stats);
    }

    [HttpPatch("{id:guid}/status")]
    public async Task<IResult> UpdateStatus(
        Guid id,
        [FromBody] UpdateFeedbackStatusRequestDto dto,
        CancellationToken cancellationToken)
    {
        if (!currentUser.TryGetUserId(out var adminId))
        {
            return TypedResults.Unauthorized();
        }

        try
        {
            var updated = await feedbackService.UpdateFeedbackStatusAsync(id, adminId, dto, cancellationToken);
            return TypedResults.Ok(updated);
        }
        catch (InvalidOperationException ex)
        {
            return TypedResults.BadRequest(new { message = ex.Message });
        }
    }

    [HttpDelete("{id:guid}")]
    public async Task<IResult> DeleteFeedback(Guid id, CancellationToken cancellationToken)
    {
        var deleted = await feedbackService.DeleteFeedbackAsync(id, cancellationToken);
        if (!deleted)
        {
            return TypedResults.NotFound(new { message = "Không tìm thấy phản hồi cần xóa." });
        }

        return TypedResults.Ok(new { message = "Đã xóa phản hồi và dọn dẹp các tệp đính kèm liên quan thành công." });
    }
}

