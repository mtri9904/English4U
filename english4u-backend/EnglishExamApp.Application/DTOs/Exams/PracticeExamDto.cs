namespace EnglishExamApp.Application.DTOs.Exams;

public sealed record PracticeExamListItemDto(
    Guid Id,
    string Title,
    string? Description,
    int? DurationMinutes,
    string? ExamType,
    DateTime CreatedAt,
    IReadOnlyList<string> SkillTypes,
    int SectionCount,
    int ReadingQuestionCount,
    int ListeningQuestionCount,
    int WritingTaskCount,
    int SpeakingPartCount);

public sealed record PracticeExamDetailDto(
    Guid Id,
    string Title,
    string? Description,
    int? DurationMinutes,
    double? TotalPoints,
    string? ExamType,
    DateTime CreatedAt,
    IReadOnlyList<string> SkillTypes,
    int SectionCount,
    int ReadingQuestionCount,
    int ListeningQuestionCount,
    int WritingTaskCount,
    int SpeakingPartCount,
    IReadOnlyList<PracticeExamSectionSummaryDto> Sections);

public sealed record PracticeExamSectionSummaryDto(
    Guid Id,
    string SkillType,
    string? Title,
    int? OrderIndex,
    int ReadingPassageCount,
    int ListeningPartCount,
    int QuestionGroupCount,
    int QuestionCount,
    int WritingTaskCount,
    int SpeakingPartCount,
    int SpeakingQuestionCount);
