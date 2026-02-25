using EnglishLearningApp.Application.Lessons.DTOs;
using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.Lessons.Queries.GetLessonsByCourseId;

public class GetLessonsByCourseIdQueryHandler(
    IGenericRepository<Lesson> lessonRepository
) : IRequestHandler<GetLessonsByCourseIdQuery, IEnumerable<LessonResult>>
{
    public async Task<IEnumerable<LessonResult>> Handle(GetLessonsByCourseIdQuery request, CancellationToken cancellationToken)
    {
        var lessons = await lessonRepository.FindAsync(l => l.CourseId == request.CourseId);
        return lessons
            .OrderBy(l => l.OrderIndex)
            .Select(l => new LessonResult(l.Id, l.CourseId, l.Title, l.ThumbnailUrl,
                l.Content, l.OrderIndex, l.Duration, l.IsPublished, l.CreatedAt));
    }
}
