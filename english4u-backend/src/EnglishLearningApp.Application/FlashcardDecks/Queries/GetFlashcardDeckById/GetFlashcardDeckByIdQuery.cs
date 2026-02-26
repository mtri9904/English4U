using EnglishLearningApp.Application.FlashcardDecks.DTOs;
using MediatR;

namespace EnglishLearningApp.Application.FlashcardDecks.Queries.GetFlashcardDeckById;

public record GetFlashcardDeckByIdQuery(Guid Id) : IRequest<FlashcardDeckResult>;
