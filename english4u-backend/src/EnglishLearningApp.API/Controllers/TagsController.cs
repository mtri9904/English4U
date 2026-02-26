using EnglishLearningApp.Application.Tags.Commands;
using EnglishLearningApp.Application.Tags.Queries;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EnglishLearningApp.API.Controllers;

[ApiController]
[Route("api/tags")]
public class TagsController(IMediator mediator) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
        => Ok(await mediator.Send(new GetAllTagsQuery()));

    [HttpPost]
    [Authorize]
    public async Task<IActionResult> Create([FromBody] CreateTagCommand command)
        => Ok(await mediator.Send(command));

    [HttpDelete("{id:guid}")]
    [Authorize]
    public async Task<IActionResult> Delete(Guid id)
    {
        await mediator.Send(new DeleteTagCommand(id));
        return NoContent();
    }
}
