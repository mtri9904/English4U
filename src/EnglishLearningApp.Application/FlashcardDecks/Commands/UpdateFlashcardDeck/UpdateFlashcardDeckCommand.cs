using MediatR;

namespace EnglishLearningApp.Application.FlashcardDecks.Commands.UpdateFlashcardDeck;

public record UpdateFlashcardDeckCommand(
    Guid Id,
    string Title,
    string? Description
) : IRequest<bool>;
