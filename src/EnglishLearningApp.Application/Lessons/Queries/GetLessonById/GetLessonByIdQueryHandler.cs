using EnglishLearningApp.Application.Lessons.DTOs;
using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.Lessons.Queries.GetLessonById;

public class GetLessonByIdQueryHandler(
    IGenericRepository<Lesson> lessonRepository
) : IRequestHandler<GetLessonByIdQuery, LessonResult>
{
    public async Task<LessonResult> Handle(GetLessonByIdQuery request, CancellationToken cancellationToken)
    {
        var lesson = await lessonRepository.GetByIdAsync(request.Id)
            ?? throw new KeyNotFoundException("Không tìm thấy bài học.");

        return new LessonResult(lesson.Id, lesson.CourseId, lesson.Title, lesson.ThumbnailUrl,
            lesson.Content, lesson.OrderIndex, lesson.Duration, lesson.IsPublished, lesson.CreatedAt);
    }
}
