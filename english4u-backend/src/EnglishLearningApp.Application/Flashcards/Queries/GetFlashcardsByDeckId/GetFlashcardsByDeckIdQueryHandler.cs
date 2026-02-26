using EnglishLearningApp.Application.Flashcards.DTOs;
using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.Flashcards.Queries.GetFlashcardsByDeckId;

public class GetFlashcardsByDeckIdQueryHandler(
    IGenericRepository<Flashcard> flashcardRepository
) : IRequestHandler<GetFlashcardsByDeckIdQuery, IEnumerable<FlashcardResult>>
{
    public async Task<IEnumerable<FlashcardResult>> Handle(GetFlashcardsByDeckIdQuery request, CancellationToken cancellationToken)
    {
        var flashcards = await flashcardRepository.FindAsync(f => f.DeckId == request.DeckId);
        return flashcards.Select(f => new FlashcardResult(f.Id, f.DeckId, f.FrontText,
            f.BackText, f.AudioUrl, f.ExampleSentence));
    }
}
