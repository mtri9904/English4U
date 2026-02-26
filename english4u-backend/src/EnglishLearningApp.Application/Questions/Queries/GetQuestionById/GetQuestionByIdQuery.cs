using EnglishLearningApp.Application.Questions.DTOs;
using MediatR;

namespace EnglishLearningApp.Application.Questions.Queries.GetQuestionById;

public record GetQuestionByIdQuery(Guid Id) : IRequest<QuestionResult>;
