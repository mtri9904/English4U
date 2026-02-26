using EnglishLearningApp.Application.UserProgress.DTOs;
using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.UserProgress.Commands.UpdateFlashcardProgress;

public class UpdateFlashcardProgressCommandHandler(
    IGenericRepository<UserFlashcardProgress> progressRepository
) : IRequestHandler<UpdateFlashcardProgressCommand, FlashcardProgressResult>
{
    public async Task<FlashcardProgressResult> Handle(UpdateFlashcardProgressCommand request, CancellationToken cancellationToken)
    {
        var existing = await progressRepository.FindAsync(
            p => p.UserId == request.UserId && p.FlashcardId == request.FlashcardId);

        var progress = existing.FirstOrDefault();

        if (progress is not null)
        {
            progress.BoxLevel = request.BoxLevel;
            progress.EaseFactor = request.EaseFactor;
            progress.NextReviewDate = request.NextReviewDate;
            progressRepository.Update(progress);
        }
        else
        {
            progress = new UserFlashcardProgress
            {
                Id = Guid.NewGuid(),
                UserId = request.UserId,
                FlashcardId = request.FlashcardId,
                BoxLevel = request.BoxLevel,
                EaseFactor = request.EaseFactor,
                NextReviewDate = request.NextReviewDate
            };
            await progressRepository.AddAsync(progress);
        }

        await progressRepository.SaveChangesAsync();

        return new FlashcardProgressResult(
            progress.Id, progress.UserId, progress.FlashcardId,
            progress.BoxLevel, progress.EaseFactor, progress.NextReviewDate);
    }
}
