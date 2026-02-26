using System.Security.Claims;
using EnglishLearningApp.Application.ExamSessions.Commands.FinishExamSession;
using EnglishLearningApp.Application.ExamSessions.Commands.StartExamSession;
using EnglishLearningApp.Application.ExamSessions.Commands.SubmitAnswer;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EnglishLearningApp.API.Controllers;

[ApiController]
[Route("api/exam-sessions")]
[Authorize]
public class ExamSessionsController(IMediator mediator) : ControllerBase
{
    [HttpPost("start")]
    public async Task<IActionResult> Start([FromBody] StartExamSessionRequest request)
    {
        var sub = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        if (!Guid.TryParse(sub, out var userId))
            return Unauthorized();

        var result = await mediator.Send(new StartExamSessionCommand(userId, request.ExamId));
        return Ok(result);
    }

    [HttpPost("{id:guid}/submit-answer")]
    public async Task<IActionResult> SubmitAnswer(Guid id, [FromBody] SubmitAnswerRequest request)
    {
        await mediator.Send(new SubmitAnswerCommand(id, request.QuestionId, request.AnswerText, request.AudioUrl));
        return Ok();
    }

    [HttpPost("{id:guid}/finish")]
    public async Task<IActionResult> Finish(Guid id)
    {
        var result = await mediator.Send(new FinishExamSessionCommand(id));
        return Ok(result);
    }
}

public record StartExamSessionRequest(Guid ExamId);
public record SubmitAnswerRequest(Guid QuestionId, string? AnswerText, string? AudioUrl);
