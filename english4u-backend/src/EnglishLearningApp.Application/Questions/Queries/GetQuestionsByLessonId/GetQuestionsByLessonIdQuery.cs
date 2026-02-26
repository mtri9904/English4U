using EnglishLearningApp.Application.Questions.DTOs;
using MediatR;

namespace EnglishLearningApp.Application.Questions.Queries.GetQuestionsByLessonId;

public record GetQuestionsByLessonIdQuery(Guid LessonId) : IRequest<IEnumerable<QuestionResult>>;
