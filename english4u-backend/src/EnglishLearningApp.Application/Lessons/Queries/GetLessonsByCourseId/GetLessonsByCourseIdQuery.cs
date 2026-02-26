using EnglishLearningApp.Application.Lessons.DTOs;
using MediatR;

namespace EnglishLearningApp.Application.Lessons.Queries.GetLessonsByCourseId;

public record GetLessonsByCourseIdQuery(Guid CourseId) : IRequest<IEnumerable<LessonResult>>;
