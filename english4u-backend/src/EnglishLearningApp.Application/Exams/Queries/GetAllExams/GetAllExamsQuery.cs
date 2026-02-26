using EnglishLearningApp.Application.Exams.DTOs;
using MediatR;

namespace EnglishLearningApp.Application.Exams.Queries.GetAllExams;

public record GetAllExamsQuery : IRequest<IEnumerable<ExamResult>>;
