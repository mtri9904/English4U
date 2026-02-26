using EnglishLearningApp.Application.Flashcards.DTOs;
using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.Flashcards.Commands.CreateFlashcard;

public class CreateFlashcardCommandHandler(
    IGenericRepository<Flashcard> flashcardRepository
) : IRequestHandler<CreateFlashcardCommand, FlashcardResult>
{
    public async Task<FlashcardResult> Handle(CreateFlashcardCommand request, CancellationToken cancellationToken)
    {
        var flashcard = new Flashcard
        {
            Id = Guid.NewGuid(),
            DeckId = request.DeckId,
            FrontText = request.FrontText,
            BackText = request.BackText,
            AudioUrl = request.AudioUrl,
            ExampleSentence = request.ExampleSentence
        };

        await flashcardRepository.AddAsync(flashcard);
        await flashcardRepository.SaveChangesAsync();

        return new FlashcardResult(flashcard.Id, flashcard.DeckId, flashcard.FrontText,
            flashcard.BackText, flashcard.AudioUrl, flashcard.ExampleSentence);
    }
}
