using EnglishLearningApp.Application.Courses.DTOs;
using MediatR;

namespace EnglishLearningApp.Application.Courses.Queries.GetCourseById;

public record GetCourseByIdQuery(Guid Id) : IRequest<CourseResult>;
