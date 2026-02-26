using EnglishLearningApp.Application.Flashcards.DTOs;
using MediatR;

namespace EnglishLearningApp.Application.Flashcards.Queries.GetFlashcardsByDeckId;

public record GetFlashcardsByDeckIdQuery(Guid DeckId) : IRequest<IEnumerable<FlashcardResult>>;
