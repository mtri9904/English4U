using EnglishLearningApp.Application.FlashcardDecks.DTOs;
using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.FlashcardDecks.Queries.GetFlashcardDeckById;

public class GetFlashcardDeckByIdQueryHandler(
    IGenericRepository<FlashcardDeck> deckRepository
) : IRequestHandler<GetFlashcardDeckByIdQuery, FlashcardDeckResult>
{
    public async Task<FlashcardDeckResult> Handle(GetFlashcardDeckByIdQuery request, CancellationToken cancellationToken)
    {
        var deck = await deckRepository.GetByIdAsync(request.Id)
            ?? throw new KeyNotFoundException("Không tìm thấy bộ thẻ.");

        return new FlashcardDeckResult(deck.Id, deck.CourseId, deck.Title, deck.Description, deck.CreatedAt);
    }
}
