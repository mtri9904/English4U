using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.Lessons.Commands.UpdateLesson;

public class UpdateLessonCommandHandler(
    IGenericRepository<Lesson> lessonRepository
) : IRequestHandler<UpdateLessonCommand, bool>
{
    public async Task<bool> Handle(UpdateLessonCommand request, CancellationToken cancellationToken)
    {
        var lesson = await lessonRepository.GetByIdAsync(request.Id)
            ?? throw new KeyNotFoundException("Không tìm thấy bài học.");

        lesson.Title = request.Title;
        lesson.ThumbnailUrl = request.ThumbnailUrl;
        lesson.Content = request.Content;
        lesson.OrderIndex = request.OrderIndex;
        lesson.Duration = request.Duration;
        lesson.IsPublished = request.IsPublished;

        lessonRepository.Update(lesson);
        await lessonRepository.SaveChangesAsync();
        return true;
    }
}
