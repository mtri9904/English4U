using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.Flashcards.Commands.UpdateFlashcard;

public class UpdateFlashcardCommandHandler(
    IGenericRepository<Flashcard> flashcardRepository
) : IRequestHandler<UpdateFlashcardCommand, bool>
{
    public async Task<bool> Handle(UpdateFlashcardCommand request, CancellationToken cancellationToken)
    {
        var flashcard = await flashcardRepository.GetByIdAsync(request.Id)
            ?? throw new KeyNotFoundException("Không tìm thấy thẻ từ vựng.");

        flashcard.FrontText = request.FrontText;
        flashcard.BackText = request.BackText;
        flashcard.AudioUrl = request.AudioUrl;
        flashcard.ExampleSentence = request.ExampleSentence;

        flashcardRepository.Update(flashcard);
        await flashcardRepository.SaveChangesAsync();
        return true;
    }
}
