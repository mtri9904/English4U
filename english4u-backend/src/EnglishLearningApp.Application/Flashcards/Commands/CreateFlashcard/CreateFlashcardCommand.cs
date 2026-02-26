using EnglishLearningApp.Application.Flashcards.DTOs;
using MediatR;

namespace EnglishLearningApp.Application.Flashcards.Commands.CreateFlashcard;

public record CreateFlashcardCommand(
    Guid DeckId,
    string FrontText,
    string BackText,
    string? AudioUrl,
    string? ExampleSentence
) : IRequest<FlashcardResult>;
