using MediatR;

namespace EnglishLearningApp.Application.Exams.Commands.UpdateExam;

public record UpdateExamCommand(
    Guid Id,
    string Title,
    string? Description,
    int? Duration,
    int? TotalPoints,
    double? PassingScore,
    bool IsPublished
) : IRequest<bool>;
