using EnglishLearningApp.Application.Courses.DTOs;
using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.Courses.Queries.GetAllCourses;

public class GetAllCoursesQueryHandler(
    IGenericRepository<Course> courseRepository
) : IRequestHandler<GetAllCoursesQuery, IEnumerable<CourseResult>>
{
    public async Task<IEnumerable<CourseResult>> Handle(GetAllCoursesQuery request, CancellationToken cancellationToken)
    {
        var courses = await courseRepository.GetAllAsync();
        return courses.Select(c => new CourseResult(c.Id, c.Title, c.Description, c.ThumbnailUrl,
            c.SkillType, c.DifficultyLevel, c.IsPublished, c.CreatedBy, c.CreatedAt));
    }
}
