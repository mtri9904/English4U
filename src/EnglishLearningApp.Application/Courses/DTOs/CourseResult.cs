namespace EnglishLearningApp.Application.Courses.DTOs;

public record CourseResult(
    Guid Id,
    string Title,
    string? Description,
    string? ThumbnailUrl,
    string? SkillType,
    string? DifficultyLevel,
    bool IsPublished,
    Guid? CreatedBy,
    DateTime CreatedAt
);
