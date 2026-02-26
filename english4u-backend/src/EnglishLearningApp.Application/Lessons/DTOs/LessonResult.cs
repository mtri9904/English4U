namespace EnglishLearningApp.Application.Lessons.DTOs;

public record LessonResult(
    Guid Id,
    Guid? CourseId,
    string Title,
    string? ThumbnailUrl,
    string? Content,
    int? OrderIndex,
    int? Duration,
    bool IsPublished,
    DateTime CreatedAt
);
