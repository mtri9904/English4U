using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.Lessons.Commands.DeleteLesson;

public class DeleteLessonCommandHandler(
    IGenericRepository<Lesson> lessonRepository
) : IRequestHandler<DeleteLessonCommand, bool>
{
    public async Task<bool> Handle(DeleteLessonCommand request, CancellationToken cancellationToken)
    {
        var lesson = await lessonRepository.GetByIdAsync(request.Id)
            ?? throw new KeyNotFoundException("Không tìm thấy bài học.");

        lessonRepository.Delete(lesson);
        await lessonRepository.SaveChangesAsync();
        return true;
    }
}
