using EnglishLearningApp.Application.Flashcards.Commands.CreateFlashcard;
using EnglishLearningApp.Application.Flashcards.Commands.DeleteFlashcard;
using EnglishLearningApp.Application.Flashcards.Commands.UpdateFlashcard;
using EnglishLearningApp.Application.Flashcards.Queries.GetFlashcardsByDeckId;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EnglishLearningApp.API.Controllers;

[ApiController]
[Route("api/flashcard-decks/{deckId:guid}/flashcards")]
public class FlashcardsController(IMediator mediator) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetByDeck(Guid deckId)
    {
        var result = await mediator.Send(new GetFlashcardsByDeckIdQuery(deckId));
        return Ok(result);
    }

    [HttpPost]
    [Authorize]
    public async Task<IActionResult> Create(Guid deckId, [FromBody] CreateFlashcardCommand command)
    {
        var result = await mediator.Send(command with { DeckId = deckId });
        return Ok(result);
    }

    [HttpPut("{id:guid}")]
    [Authorize]
    public async Task<IActionResult> Update(Guid deckId, Guid id, [FromBody] UpdateFlashcardCommand command)
    {
        await mediator.Send(command with { Id = id });
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    [Authorize]
    public async Task<IActionResult> Delete(Guid deckId, Guid id)
    {
        await mediator.Send(new DeleteFlashcardCommand(id));
        return NoContent();
    }
}
