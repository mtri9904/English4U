using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.Courses.Commands.UpdateCourse;

public class UpdateCourseCommandHandler(
    IGenericRepository<Course> courseRepository
) : IRequestHandler<UpdateCourseCommand, bool>
{
    public async Task<bool> Handle(UpdateCourseCommand request, CancellationToken cancellationToken)
    {
        var course = await courseRepository.GetByIdAsync(request.Id)
            ?? throw new KeyNotFoundException("Không tìm thấy khóa học.");

        course.Title = request.Title;
        course.Description = request.Description;
        course.ThumbnailUrl = request.ThumbnailUrl;
        course.SkillType = request.SkillType;
        course.DifficultyLevel = request.DifficultyLevel;
        course.IsPublished = request.IsPublished;
        course.UpdatedAt = DateTime.UtcNow;

        courseRepository.Update(course);
        await courseRepository.SaveChangesAsync();
        return true;
    }
}
