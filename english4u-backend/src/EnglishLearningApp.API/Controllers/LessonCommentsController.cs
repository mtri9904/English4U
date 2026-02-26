using System.Security.Claims;
using EnglishLearningApp.Application.LessonComments.Commands;
using EnglishLearningApp.Application.LessonComments.Queries;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EnglishLearningApp.API.Controllers;

[ApiController]
[Route("api/lessons/{lessonId:guid}/comments")]
public class LessonCommentsController(IMediator mediator) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetByLesson(Guid lessonId)
        => Ok(await mediator.Send(new GetCommentsByLessonIdQuery(lessonId)));

    [HttpPost]
    [Authorize]
    public async Task<IActionResult> Create(Guid lessonId, [FromBody] CreateCommentRequest request)
    {
        var sub = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        if (!Guid.TryParse(sub, out var userId)) return Unauthorized();
        var result = await mediator.Send(new CreateCommentCommand(lessonId, userId, request.Content, request.ParentId));
        return Ok(result);
    }
}

public record CreateCommentRequest(string Content, Guid? ParentId);
