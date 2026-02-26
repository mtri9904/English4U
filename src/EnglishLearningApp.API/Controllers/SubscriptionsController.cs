using System.Security.Claims;
using EnglishLearningApp.Application.Subscriptions.Commands;
using EnglishLearningApp.Application.Subscriptions.Queries;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EnglishLearningApp.API.Controllers;

[ApiController]
[Route("api/subscriptions")]
public class SubscriptionsController(IMediator mediator) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
        => Ok(await mediator.Send(new GetAllSubscriptionsQuery()));

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
        => Ok(await mediator.Send(new GetSubscriptionByIdQuery(id)));

    [HttpPost]
    [Authorize]
    public async Task<IActionResult> Create([FromBody] CreateSubscriptionCommand command)
        => Ok(await mediator.Send(command));

    [HttpPut("{id:guid}")]
    [Authorize]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateSubscriptionCommand command)
    {
        await mediator.Send(command with { Id = id });
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    [Authorize]
    public async Task<IActionResult> Delete(Guid id)
    {
        await mediator.Send(new DeleteSubscriptionCommand(id));
        return NoContent();
    }

    [HttpGet("my")]
    [Authorize]
    public async Task<IActionResult> GetMySubscriptions()
    {
        var sub = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        if (!Guid.TryParse(sub, out var userId)) return Unauthorized();
        return Ok(await mediator.Send(new GetUserSubscriptionsQuery(userId)));
    }

    [HttpGet("my/active")]
    [Authorize]
    public async Task<IActionResult> GetActiveSubscription()
    {
        var sub = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        if (!Guid.TryParse(sub, out var userId)) return Unauthorized();
        var result = await mediator.Send(new GetActiveUserSubscriptionQuery(userId));
        return result is null ? NotFound("Không có gói VIP đang hoạt động.") : Ok(result);
    }
}
