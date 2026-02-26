namespace EnglishLearningApp.Application.Questions.DTOs;

public record QuestionResult(
    Guid Id,
    Guid? LessonId,
    string? SkillType,
    string? QuestionType,
    string? Content,
    string? AudioUrl,
    string? ImageUrl,
    string? CorrectAnswer,
    string? Options,
    int Points,
    int? OrderIndex,
    DateTime CreatedAt
);
