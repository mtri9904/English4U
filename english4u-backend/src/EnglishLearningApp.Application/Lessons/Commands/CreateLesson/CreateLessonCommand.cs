using EnglishLearningApp.Application.Lessons.DTOs;
using MediatR;

namespace EnglishLearningApp.Application.Lessons.Commands.CreateLesson;

public record CreateLessonCommand(
    Guid CourseId,
    string Title,
    string? ThumbnailUrl,
    string? Content,
    int? OrderIndex,
    int? Duration
) : IRequest<LessonResult>;
