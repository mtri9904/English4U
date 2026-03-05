using System.Text.Json.Serialization;

namespace EnglishExamApp.Application.DTOs.Exams;

public sealed record AiGeneratedExamDto(
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("description")] string? Description,
    [property: JsonPropertyName("durationMinutes")] int? DurationMinutes,
    [property: JsonPropertyName("totalPoints")] double? TotalPoints,
    [property: JsonPropertyName("examType")] string? ExamType,
    [property: JsonPropertyName("sections")] List<AiGeneratedSectionDto> Sections);

public sealed record AiGeneratedSectionDto(
    [property: JsonPropertyName("skillType")] string SkillType,
    [property: JsonPropertyName("title")] string? Title,
    [property: JsonPropertyName("orderIndex")] int OrderIndex,
    [property: JsonPropertyName("questionGroups")] List<AiGeneratedGroupDto> QuestionGroups);

public sealed record AiGeneratedGroupDto(
    [property: JsonPropertyName("title")] string? Title,
    [property: JsonPropertyName("content")] string? Content,
    [property: JsonPropertyName("audioUrl")] string? AudioUrl,
    [property: JsonPropertyName("orderIndex")] int OrderIndex,
    [property: JsonPropertyName("questions")] List<AiGeneratedQuestionDto> Questions);

public sealed record AiGeneratedQuestionDto(
    [property: JsonPropertyName("questionType")] string QuestionType,
    [property: JsonPropertyName("content")] string Content,
    [property: JsonPropertyName("correctAnswer")] string? CorrectAnswer,
    [property: JsonPropertyName("explanation")] string? Explanation,
    [property: JsonPropertyName("points")] double Points,
    [property: JsonPropertyName("orderIndex")] int OrderIndex,
    [property: JsonPropertyName("options")] List<AiGeneratedOptionDto> Options);

public sealed record AiGeneratedOptionDto(
    [property: JsonPropertyName("optionText")] string OptionText,
    [property: JsonPropertyName("isCorrect")] bool IsCorrect,
    [property: JsonPropertyName("orderIndex")] int OrderIndex);
