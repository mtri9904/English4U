using EnglishLearningApp.Application.Courses.DTOs;
using MediatR;

namespace EnglishLearningApp.Application.Courses.Queries.GetAllCourses;

public record GetAllCoursesQuery : IRequest<IEnumerable<CourseResult>>;
