using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.Flashcards.Commands.DeleteFlashcard;

public class DeleteFlashcardCommandHandler(
    IGenericRepository<Flashcard> flashcardRepository
) : IRequestHandler<DeleteFlashcardCommand, bool>
{
    public async Task<bool> Handle(DeleteFlashcardCommand request, CancellationToken cancellationToken)
    {
        var flashcard = await flashcardRepository.GetByIdAsync(request.Id)
            ?? throw new KeyNotFoundException("Không tìm thấy thẻ từ vựng.");

        flashcardRepository.Delete(flashcard);
        await flashcardRepository.SaveChangesAsync();
        return true;
    }
}
