using EnglishLearningApp.Application.Courses.DTOs;
using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.Courses.Queries.GetCourseById;

public class GetCourseByIdQueryHandler(
    IGenericRepository<Course> courseRepository
) : IRequestHandler<GetCourseByIdQuery, CourseResult>
{
    public async Task<CourseResult> Handle(GetCourseByIdQuery request, CancellationToken cancellationToken)
    {
        var course = await courseRepository.GetByIdAsync(request.Id)
            ?? throw new KeyNotFoundException("Không tìm thấy khóa học.");

        return new CourseResult(course.Id, course.Title, course.Description, course.ThumbnailUrl,
            course.SkillType, course.DifficultyLevel, course.IsPublished, course.CreatedBy, course.CreatedAt);
    }
}
