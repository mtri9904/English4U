using EnglishLearningApp.Application.Questions.Commands.CreateQuestion;
using EnglishLearningApp.Application.Questions.Commands.DeleteQuestion;
using EnglishLearningApp.Application.Questions.Commands.UpdateQuestion;
using EnglishLearningApp.Application.Questions.Queries.GetQuestionById;
using EnglishLearningApp.Application.Questions.Queries.GetQuestionsByLessonId;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EnglishLearningApp.API.Controllers;

[ApiController]
[Route("api/lessons/{lessonId:guid}/questions")]
public class QuestionsController(IMediator mediator) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetByLesson(Guid lessonId)
    {
        var result = await mediator.Send(new GetQuestionsByLessonIdQuery(lessonId));
        return Ok(result);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid lessonId, Guid id)
    {
        var result = await mediator.Send(new GetQuestionByIdQuery(id));
        return Ok(result);
    }

    [HttpPost]
    [Authorize]
    public async Task<IActionResult> Create(Guid lessonId, [FromBody] CreateQuestionCommand command)
    {
        var result = await mediator.Send(command with { LessonId = lessonId });
        return CreatedAtAction(nameof(GetById), new { lessonId, id = result.Id }, result);
    }

    [HttpPut("{id:guid}")]
    [Authorize]
    public async Task<IActionResult> Update(Guid lessonId, Guid id, [FromBody] UpdateQuestionCommand command)
    {
        await mediator.Send(command with { Id = id });
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    [Authorize]
    public async Task<IActionResult> Delete(Guid lessonId, Guid id)
    {
        await mediator.Send(new DeleteQuestionCommand(id));
        return NoContent();
    }
}
