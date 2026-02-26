using EnglishLearningApp.Application.Exams.Commands.CreateExam;
using EnglishLearningApp.Application.Exams.Commands.DeleteExam;
using EnglishLearningApp.Application.Exams.Commands.UpdateExam;
using EnglishLearningApp.Application.Exams.Queries.GetAllExams;
using EnglishLearningApp.Application.Exams.Queries.GetExamById;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EnglishLearningApp.API.Controllers;

[ApiController]
[Route("api/exams")]
public class ExamsController(IMediator mediator) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var result = await mediator.Send(new GetAllExamsQuery());
        return Ok(result);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var result = await mediator.Send(new GetExamByIdQuery(id));
        return Ok(result);
    }

    [HttpPost]
    [Authorize]
    public async Task<IActionResult> Create([FromBody] CreateExamCommand command)
    {
        var result = await mediator.Send(command);
        return CreatedAtAction(nameof(GetById), new { id = result.Id }, result);
    }

    [HttpPut("{id:guid}")]
    [Authorize]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateExamCommand command)
    {
        await mediator.Send(command with { Id = id });
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    [Authorize]
    public async Task<IActionResult> Delete(Guid id)
    {
        await mediator.Send(new DeleteExamCommand(id));
        return NoContent();
    }
}
