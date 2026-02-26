using MediatR;

namespace EnglishLearningApp.Application.Lessons.Commands.DeleteLesson;

public record DeleteLessonCommand(Guid Id) : IRequest<bool>;
