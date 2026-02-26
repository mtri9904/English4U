using MediatR;

namespace EnglishLearningApp.Application.Flashcards.Commands.UpdateFlashcard;

public record UpdateFlashcardCommand(
    Guid Id,
    string FrontText,
    string BackText,
    string? AudioUrl,
    string? ExampleSentence
) : IRequest<bool>;
