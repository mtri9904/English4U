using EnglishLearningApp.Application.FlashcardDecks.DTOs;
using MediatR;

namespace EnglishLearningApp.Application.FlashcardDecks.Queries.GetAllFlashcardDecks;

public record GetAllFlashcardDecksQuery : IRequest<IEnumerable<FlashcardDeckResult>>;
