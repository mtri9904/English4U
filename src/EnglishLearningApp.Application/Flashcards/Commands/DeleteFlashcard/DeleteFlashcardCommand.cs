using MediatR;

namespace EnglishLearningApp.Application.Flashcards.Commands.DeleteFlashcard;

public record DeleteFlashcardCommand(Guid Id) : IRequest<bool>;
