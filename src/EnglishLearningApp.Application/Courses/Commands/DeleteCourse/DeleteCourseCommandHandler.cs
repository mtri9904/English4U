using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.Courses.Commands.DeleteCourse;

public class DeleteCourseCommandHandler(
    IGenericRepository<Course> courseRepository
) : IRequestHandler<DeleteCourseCommand, bool>
{
    public async Task<bool> Handle(DeleteCourseCommand request, CancellationToken cancellationToken)
    {
        var course = await courseRepository.GetByIdAsync(request.Id)
            ?? throw new KeyNotFoundException("Không tìm thấy khóa học.");

        courseRepository.Delete(course);
        await courseRepository.SaveChangesAsync();
        return true;
    }
}
