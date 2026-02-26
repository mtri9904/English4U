using EnglishLearningApp.Application.UserProgress.DTOs;
using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.UserProgress.Queries.GetDueFlashcards;

public class GetDueFlashcardsQueryHandler(
    IGenericRepository<UserFlashcardProgress> progressRepository,
    IGenericRepository<Flashcard> flashcardRepository
) : IRequestHandler<GetDueFlashcardsQuery, IEnumerable<DueFlashcardResult>>
{
    public async Task<IEnumerable<DueFlashcardResult>> Handle(GetDueFlashcardsQuery request, CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;

        var dueProgresses = await progressRepository.FindAsync(
            p => p.UserId == request.UserId && p.NextReviewDate <= now);

        var results = new List<DueFlashcardResult>();

        foreach (var progress in dueProgresses)
        {
            var flashcard = await flashcardRepository.GetByIdAsync(progress.FlashcardId);
            if (flashcard is null) continue;

            results.Add(new DueFlashcardResult(
                flashcard.Id,
                flashcard.FrontText,
                flashcard.BackText,
                flashcard.AudioUrl,
                flashcard.ExampleSentence,
                progress.BoxLevel,
                progress.EaseFactor,
                progress.NextReviewDate
            ));
        }

        return results.OrderBy(r => r.NextReviewDate);
    }
}
