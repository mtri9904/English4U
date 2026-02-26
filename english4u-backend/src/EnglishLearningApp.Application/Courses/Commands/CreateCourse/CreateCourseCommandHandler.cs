using EnglishLearningApp.Application.Courses.DTOs;
using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.Courses.Commands.CreateCourse;

public class CreateCourseCommandHandler(
    IGenericRepository<Course> courseRepository
) : IRequestHandler<CreateCourseCommand, CourseResult>
{
    public async Task<CourseResult> Handle(CreateCourseCommand request, CancellationToken cancellationToken)
    {
        var course = new Course
        {
            Id = Guid.NewGuid(),
            Title = request.Title,
            Description = request.Description,
            ThumbnailUrl = request.ThumbnailUrl,
            SkillType = request.SkillType,
            DifficultyLevel = request.DifficultyLevel,
            IsPublished = false,
            CreatedBy = request.CreatedBy,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        await courseRepository.AddAsync(course);
        await courseRepository.SaveChangesAsync();

        return new CourseResult(course.Id, course.Title, course.Description, course.ThumbnailUrl,
            course.SkillType, course.DifficultyLevel, course.IsPublished, course.CreatedBy, course.CreatedAt);
    }
}
