using MediatR;

namespace EnglishLearningApp.Application.Courses.Commands.DeleteCourse;

public record DeleteCourseCommand(Guid Id) : IRequest<bool>;
