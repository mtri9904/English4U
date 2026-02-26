using EnglishLearningApp.Application.Lessons.DTOs;
using MediatR;

namespace EnglishLearningApp.Application.Lessons.Queries.GetLessonById;

public record GetLessonByIdQuery(Guid Id) : IRequest<LessonResult>;
