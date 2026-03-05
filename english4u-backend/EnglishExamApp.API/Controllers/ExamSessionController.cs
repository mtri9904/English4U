using EnglishExamApp.Application.DTOs.ExamExecution;
using EnglishExamApp.Application.Services;
using Microsoft.AspNetCore.Mvc;

namespace EnglishExamApp.API.Controllers;

[ApiController]
[Route("api/exam-sessions")]
public class ExamSessionController(IExamExecutionService examExecutionService) : ControllerBase
{
    [HttpPost("start")]
    public async Task<IResult> StartSession(
        [FromQuery] Guid userId,
        [FromQuery] Guid examId,
        CancellationToken cancellationToken)
    {
        var sessionId = await examExecutionService.StartSessionAsync(userId, examId, cancellationToken);

        return TypedResults.Created($"/api/exam-sessions/{sessionId}", new { sessionId });
    }

    [HttpPut("auto-save")]
    public async Task<IResult> AutoSaveAnswer(
        [FromBody] AutoSaveAnswerDto dto,
        CancellationToken cancellationToken)
    {
        await examExecutionService.AutoSaveAnswerAsync(dto, cancellationToken);

        return TypedResults.Ok(new { message = "Answer saved." });
    }

    [HttpPost("{sessionId:guid}/submit")]
    public async Task<IResult> SubmitExam(Guid sessionId, CancellationToken cancellationToken)
    {
        var result = await examExecutionService.SubmitExamAsync(sessionId, cancellationToken);

        return TypedResults.Ok(result);
    }
}
