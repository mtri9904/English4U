using EnglishLearningApp.Application.FlashcardDecks.DTOs;
using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.FlashcardDecks.Queries.GetAllFlashcardDecks;

public class GetAllFlashcardDecksQueryHandler(
    IGenericRepository<FlashcardDeck> deckRepository
) : IRequestHandler<GetAllFlashcardDecksQuery, IEnumerable<FlashcardDeckResult>>
{
    public async Task<IEnumerable<FlashcardDeckResult>> Handle(GetAllFlashcardDecksQuery request, CancellationToken cancellationToken)
    {
        var decks = await deckRepository.GetAllAsync();
        return decks.Select(d => new FlashcardDeckResult(d.Id, d.CourseId, d.Title, d.Description, d.CreatedAt));
    }
}
