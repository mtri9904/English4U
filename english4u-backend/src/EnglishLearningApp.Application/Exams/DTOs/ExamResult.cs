namespace EnglishLearningApp.Application.Exams.DTOs;

public record ExamResult(
    Guid Id,
    Guid? CourseId,
    string Title,
    string? Description,
    int? Duration,
    int? TotalPoints,
    double? PassingScore,
    bool IsPublished,
    DateTime CreatedAt
);
