namespace EnglishLearningApp.Application.UserProgress.DTOs;

public record FlashcardProgressResult(
    Guid Id,
    Guid UserId,
    Guid FlashcardId,
    int BoxLevel,
    double EaseFactor,
    DateTime NextReviewDate
);

public record DueFlashcardResult(
    Guid FlashcardId,
    string FrontText,
    string BackText,
    string? AudioUrl,
    string? ExampleSentence,
    int BoxLevel,
    double EaseFactor,
    DateTime NextReviewDate
);
