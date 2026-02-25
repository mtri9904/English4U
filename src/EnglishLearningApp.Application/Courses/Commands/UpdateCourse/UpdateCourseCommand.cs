using MediatR;

namespace EnglishLearningApp.Application.Courses.Commands.UpdateCourse;

public record UpdateCourseCommand(
    Guid Id,
    string Title,
    string? Description,
    string? ThumbnailUrl,
    string? SkillType,
    string? DifficultyLevel,
    bool IsPublished
) : IRequest<bool>;
