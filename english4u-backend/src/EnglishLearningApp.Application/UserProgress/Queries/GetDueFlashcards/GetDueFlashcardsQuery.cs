using EnglishLearningApp.Application.UserProgress.DTOs;
using MediatR;

namespace EnglishLearningApp.Application.UserProgress.Queries.GetDueFlashcards;

public record GetDueFlashcardsQuery(Guid UserId) : IRequest<IEnumerable<DueFlashcardResult>>;
