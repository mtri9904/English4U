using EnglishLearningApp.Application.Exams.DTOs;
using MediatR;

namespace EnglishLearningApp.Application.Exams.Queries.GetExamById;

public record GetExamByIdQuery(Guid Id) : IRequest<ExamResult>;
