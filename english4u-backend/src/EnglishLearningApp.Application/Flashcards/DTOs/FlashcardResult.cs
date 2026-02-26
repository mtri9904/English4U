namespace EnglishLearningApp.Application.Flashcards.DTOs;

public record FlashcardResult(
    Guid Id,
    Guid DeckId,
    string FrontText,
    string BackText,
    string? AudioUrl,
    string? ExampleSentence
);
