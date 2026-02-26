using EnglishLearningApp.Application.Achievements.Commands;
using EnglishLearningApp.Application.Achievements.Queries;
using EnglishLearningApp.Application.UserAchievements.Commands;
using EnglishLearningApp.Application.UserAchievements.Queries;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EnglishLearningApp.API.Controllers;

[ApiController]
[Route("api/achievements")]
public class AchievementsController(IMediator mediator) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
        => Ok(await mediator.Send(new GetAllAchievementsQuery()));

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
        => Ok(await mediator.Send(new GetAchievementByIdQuery(id)));

    [HttpPost]
    [Authorize]
    public async Task<IActionResult> Create([FromBody] CreateAchievementCommand command)
        => Ok(await mediator.Send(command));

    [HttpPut("{id:guid}")]
    [Authorize]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateAchievementCommand command)
    {
        await mediator.Send(command with { Id = id });
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    [Authorize]
    public async Task<IActionResult> Delete(Guid id)
    {
        await mediator.Send(new DeleteAchievementCommand(id));
        return NoContent();
    }

    [HttpGet("user/{userId:guid}")]
    [Authorize]
    public async Task<IActionResult> GetUserAchievements(Guid userId)
        => Ok(await mediator.Send(new GetUserAchievementsQuery(userId)));

    [HttpPost("grant")]
    [Authorize]
    public async Task<IActionResult> Grant([FromBody] GrantUserAchievementCommand command)
        => Ok(await mediator.Send(command));
}
