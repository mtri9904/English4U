using EnglishLearningApp.Application.FlashcardDecks.DTOs;
using MediatR;

namespace EnglishLearningApp.Application.FlashcardDecks.Commands.CreateFlashcardDeck;

public record CreateFlashcardDeckCommand(
    Guid? CourseId,
    string Title,
    string? Description
) : IRequest<FlashcardDeckResult>;
