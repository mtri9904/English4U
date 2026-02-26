namespace EnglishLearningApp.Application.FlashcardDecks.DTOs;

public record FlashcardDeckResult(
    Guid Id,
    Guid? CourseId,
    string Title,
    string? Description,
    DateTime CreatedAt
);
