using MediatR;

namespace EnglishLearningApp.Application.Questions.Commands.UpdateQuestion;

public record UpdateQuestionCommand(
    Guid Id,
    string? SkillType,
    string? QuestionType,
    string? Content,
    string? AudioUrl,
    string? ImageUrl,
    string? CorrectAnswer,
    string? Options,
    int Points,
    int? OrderIndex
) : IRequest<bool>;
