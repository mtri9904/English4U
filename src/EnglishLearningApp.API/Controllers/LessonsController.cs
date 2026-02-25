using EnglishLearningApp.Application.Lessons.Commands.CreateLesson;
using EnglishLearningApp.Application.Lessons.Commands.DeleteLesson;
using EnglishLearningApp.Application.Lessons.Commands.UpdateLesson;
using EnglishLearningApp.Application.Lessons.Queries.GetLessonById;
using EnglishLearningApp.Application.Lessons.Queries.GetLessonsByCourseId;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EnglishLearningApp.API.Controllers;

[ApiController]
[Route("api/courses/{courseId:guid}/lessons")]
public class LessonsController(IMediator mediator) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetByCourse(Guid courseId)
    {
        var result = await mediator.Send(new GetLessonsByCourseIdQuery(courseId));
        return Ok(result);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid courseId, Guid id)
    {
        var result = await mediator.Send(new GetLessonByIdQuery(id));
        return Ok(result);
    }

    [HttpPost]
    [Authorize]
    public async Task<IActionResult> Create(Guid courseId, [FromBody] CreateLessonCommand command)
    {
        var result = await mediator.Send(command with { CourseId = courseId });
        return CreatedAtAction(nameof(GetById), new { courseId, id = result.Id }, result);
    }

    [HttpPut("{id:guid}")]
    [Authorize]
    public async Task<IActionResult> Update(Guid courseId, Guid id, [FromBody] UpdateLessonCommand command)
    {
        await mediator.Send(command with { Id = id });
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    [Authorize]
    public async Task<IActionResult> Delete(Guid courseId, Guid id)
    {
        await mediator.Send(new DeleteLessonCommand(id));
        return NoContent();
    }
}
