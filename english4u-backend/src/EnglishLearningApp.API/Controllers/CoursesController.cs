using EnglishLearningApp.Application.Courses.Commands.CreateCourse;
using EnglishLearningApp.Application.Courses.Commands.DeleteCourse;
using EnglishLearningApp.Application.Courses.Commands.UpdateCourse;
using EnglishLearningApp.Application.Courses.Queries.GetAllCourses;
using EnglishLearningApp.Application.Courses.Queries.GetCourseById;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EnglishLearningApp.API.Controllers;

[ApiController]
[Route("api/courses")]
public class CoursesController(IMediator mediator) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var result = await mediator.Send(new GetAllCoursesQuery());
        return Ok(result);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var result = await mediator.Send(new GetCourseByIdQuery(id));
        return Ok(result);
    }

    [HttpPost]
    [Authorize]
    public async Task<IActionResult> Create([FromBody] CreateCourseCommand command)
    {
        var result = await mediator.Send(command);
        return CreatedAtAction(nameof(GetById), new { id = result.Id }, result);
    }

    [HttpPut("{id:guid}")]
    [Authorize]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateCourseCommand command)
    {
        await mediator.Send(command with { Id = id });
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    [Authorize]
    public async Task<IActionResult> Delete(Guid id)
    {
        await mediator.Send(new DeleteCourseCommand(id));
        return NoContent();
    }
}
