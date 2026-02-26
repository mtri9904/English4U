using System.Security.Claims;
using EnglishLearningApp.Application.Notifications.Commands;
using EnglishLearningApp.Application.Notifications.Queries;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EnglishLearningApp.API.Controllers;

[ApiController]
[Route("api/notifications")]
[Authorize]
public class NotificationsController(IMediator mediator) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var sub = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        if (!Guid.TryParse(sub, out var userId)) return Unauthorized();
        return Ok(await mediator.Send(new GetNotificationsQuery(userId)));
    }

    [HttpPost("{id:guid}/read")]
    public async Task<IActionResult> MarkRead(Guid id)
    {
        await mediator.Send(new MarkNotificationReadCommand(id));
        return NoContent();
    }
}
