using EnglishExamApp.Application.DTOs.ExamExecution;
using EnglishExamApp.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EnglishExamApp.API.Controllers;

[ApiController]
[Route("api/admin/attempts")]
[Authorize(Roles = "Admin")]
public class AdminAttemptController(IExamExecutionService examExecutionService) : ControllerBase
{
    [HttpGet]
    public async Task<IResult> GetAttempts(
        [FromQuery] string? status,
        [FromQuery] string? search,
        CancellationToken cancellationToken)
    {
        var attempts = await examExecutionService.GetAdminAttemptsAsync(
            new AdminAttemptQueryDto(status, search),
            cancellationToken);

        return TypedResults.Ok(attempts);
    }

    [HttpGet("{sessionId:guid}")]
    public async Task<IResult> GetAttemptDetail(Guid sessionId, CancellationToken cancellationToken)
    {
        var attempt = await examExecutionService.GetAdminAttemptDetailAsync(sessionId, cancellationToken);
        return attempt is null
            ? TypedResults.NotFound(new { message = "Attempt not found." })
            : TypedResults.Ok(attempt);
    }
}
