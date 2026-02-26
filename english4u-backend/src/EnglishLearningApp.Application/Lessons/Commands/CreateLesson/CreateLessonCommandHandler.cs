using EnglishLearningApp.Application.Lessons.DTOs;
using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.Lessons.Commands.CreateLesson;

public class CreateLessonCommandHandler(
    IGenericRepository<Lesson> lessonRepository
) : IRequestHandler<CreateLessonCommand, LessonResult>
{
    public async Task<LessonResult> Handle(CreateLessonCommand request, CancellationToken cancellationToken)
    {
        var lesson = new Lesson
        {
            Id = Guid.NewGuid(),
            CourseId = request.CourseId,
            Title = request.Title,
            ThumbnailUrl = request.ThumbnailUrl,
            Content = request.Content,
            OrderIndex = request.OrderIndex,
            Duration = request.Duration,
            IsPublished = false,
            CreatedAt = DateTime.UtcNow
        };

        await lessonRepository.AddAsync(lesson);
        await lessonRepository.SaveChangesAsync();

        return new LessonResult(lesson.Id, lesson.CourseId, lesson.Title, lesson.ThumbnailUrl,
            lesson.Content, lesson.OrderIndex, lesson.Duration, lesson.IsPublished, lesson.CreatedAt);
    }
}
