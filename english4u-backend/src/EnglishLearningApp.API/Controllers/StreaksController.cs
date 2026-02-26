using System.Security.Claims;
using EnglishLearningApp.Application.DailyStreaks.Commands;
using EnglishLearningApp.Application.DailyStreaks.Queries;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EnglishLearningApp.API.Controllers;

[ApiController]
[Route("api/streaks")]
[Authorize]
public class StreaksController(IMediator mediator) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var sub = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        if (!Guid.TryParse(sub, out var userId)) return Unauthorized();
        var result = await mediator.Send(new GetDailyStreakQuery(userId));
        return Ok(result);
    }

    [HttpPost("update")]
    public async Task<IActionResult> Update()
    {
        var sub = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        if (!Guid.TryParse(sub, out var userId)) return Unauthorized();
        var result = await mediator.Send(new UpdateDailyStreakCommand(userId));
        return Ok(result);
    }
}
