using MediatR;

namespace EnglishLearningApp.Application.Lessons.Commands.UpdateLesson;

public record UpdateLessonCommand(
    Guid Id,
    string Title,
    string? ThumbnailUrl,
    string? Content,
    int? OrderIndex,
    int? Duration,
    bool IsPublished
) : IRequest<bool>;
