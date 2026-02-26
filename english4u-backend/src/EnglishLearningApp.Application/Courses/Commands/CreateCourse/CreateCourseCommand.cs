using EnglishLearningApp.Application.Courses.DTOs;
using MediatR;

namespace EnglishLearningApp.Application.Courses.Commands.CreateCourse;

public record CreateCourseCommand(
    string Title,
    string? Description,
    string? ThumbnailUrl,
    string? SkillType,
    string? DifficultyLevel,
    Guid? CreatedBy
) : IRequest<CourseResult>;
