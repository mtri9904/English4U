using EnglishLearningApp.Application.FlashcardDecks.Commands.CreateFlashcardDeck;
using EnglishLearningApp.Application.FlashcardDecks.Commands.DeleteFlashcardDeck;
using EnglishLearningApp.Application.FlashcardDecks.Commands.UpdateFlashcardDeck;
using EnglishLearningApp.Application.FlashcardDecks.Queries.GetAllFlashcardDecks;
using EnglishLearningApp.Application.FlashcardDecks.Queries.GetFlashcardDeckById;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EnglishLearningApp.API.Controllers;

[ApiController]
[Route("api/flashcard-decks")]
public class FlashcardDecksController(IMediator mediator) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var result = await mediator.Send(new GetAllFlashcardDecksQuery());
        return Ok(result);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var result = await mediator.Send(new GetFlashcardDeckByIdQuery(id));
        return Ok(result);
    }

    [HttpPost]
    [Authorize]
    public async Task<IActionResult> Create([FromBody] CreateFlashcardDeckCommand command)
    {
        var result = await mediator.Send(command);
        return CreatedAtAction(nameof(GetById), new { id = result.Id }, result);
    }

    [HttpPut("{id:guid}")]
    [Authorize]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateFlashcardDeckCommand command)
    {
        await mediator.Send(command with { Id = id });
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    [Authorize]
    public async Task<IActionResult> Delete(Guid id)
    {
        await mediator.Send(new DeleteFlashcardDeckCommand(id));
        return NoContent();
    }
}
