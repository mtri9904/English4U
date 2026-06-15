namespace EnglishExamApp.Application.DTOs.Exams;

public sealed record ExamListItemDto(
    Guid Id,
    string Title,
    string? Description,
    int? DurationMinutes,
    double? TotalPoints,
    string? ExamType,
    bool IsPublished,
    Guid? CreatedBy,
    DateTime CreatedAt,
    List<string> SkillTypes);
