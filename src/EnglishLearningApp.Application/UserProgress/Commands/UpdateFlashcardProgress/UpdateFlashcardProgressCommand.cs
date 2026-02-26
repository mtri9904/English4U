using EnglishLearningApp.Application.UserProgress.DTOs;
using MediatR;

namespace EnglishLearningApp.Application.UserProgress.Commands.UpdateFlashcardProgress;

public record UpdateFlashcardProgressCommand(
    Guid UserId,
    Guid FlashcardId,
    int BoxLevel,
    double EaseFactor,
    DateTime NextReviewDate
) : IRequest<FlashcardProgressResult>;
