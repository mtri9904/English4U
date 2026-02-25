using EnglishLearningApp.Application.Questions.DTOs;
using MediatR;

namespace EnglishLearningApp.Application.Questions.Commands.CreateQuestion;

public record CreateQuestionCommand(
    Guid LessonId,
    string? SkillType,
    string? QuestionType,
    string? Content,
    string? AudioUrl,
    string? ImageUrl,
    string? CorrectAnswer,
    string? Options,
    int Points,
    int? OrderIndex
) : IRequest<QuestionResult>;
