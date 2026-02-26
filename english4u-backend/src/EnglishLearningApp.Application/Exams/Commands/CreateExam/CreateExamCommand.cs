using EnglishLearningApp.Application.Exams.DTOs;
using MediatR;

namespace EnglishLearningApp.Application.Exams.Commands.CreateExam;

public record CreateExamCommand(
    Guid? CourseId,
    string Title,
    string? Description,
    int? Duration,
    int? TotalPoints,
    double? PassingScore
) : IRequest<ExamResult>;
