using System.Security.Claims;
using EnglishLearningApp.Application.UserProgress.Commands.UpdateFlashcardProgress;
using EnglishLearningApp.Application.UserProgress.Queries.GetDueFlashcards;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EnglishLearningApp.API.Controllers;

[ApiController]
[Route("api/user-progress")]
[Authorize]
public class UserProgressController(IMediator mediator) : ControllerBase
{
    [HttpGet("due-flashcards")]
    public async Task<IActionResult> GetDueFlashcards()
    {
        var sub = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        if (!Guid.TryParse(sub, out var userId))
            return Unauthorized();

        var result = await mediator.Send(new GetDueFlashcardsQuery(userId));
        return Ok(result);
    }

    [HttpPost("flashcard-progress")]
    public async Task<IActionResult> UpdateProgress([FromBody] UpdateFlashcardProgressCommand command)
    {
        var sub = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        if (!Guid.TryParse(sub, out var userId))
            return Unauthorized();

        var result = await mediator.Send(command with { UserId = userId });
        return Ok(result);
    }
}
