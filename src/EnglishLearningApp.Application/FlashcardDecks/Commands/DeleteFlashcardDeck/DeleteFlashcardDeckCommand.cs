using MediatR;

namespace EnglishLearningApp.Application.FlashcardDecks.Commands.DeleteFlashcardDeck;

public record DeleteFlashcardDeckCommand(Guid Id) : IRequest<bool>;
