namespace EnglishExamApp.Application.DTOs.Exams;

public sealed record ExamDetailDto(
    Guid Id,
    string Title,
    string? Description,
    int? DurationMinutes,
    double? TotalPoints,
    string? ExamType,
    bool IsPublished,
    Guid? CreatedBy,
    DateTime CreatedAt,
    IReadOnlyList<SectionDetailDto> Sections);

public sealed record SectionDetailDto(
    Guid Id,
    string SkillType,
    string? Title,
    int? OrderIndex,
    IReadOnlyList<ReadingPassageDto>? ReadingPassages,
    IReadOnlyList<ListeningPartDto>? ListeningParts,
    IReadOnlyList<WritingTaskDto>? WritingTasks,
    IReadOnlyList<SpeakingPartDto>? SpeakingParts);

public sealed record ReadingPassageDto(
    Guid Id,
    int? PassageNumber,
    string? Title,
    string? ParagraphsData,
    string? AssetsData,
    IReadOnlyList<QuestionGroupDto> QuestionGroups);

public sealed record ListeningPartDto(
    Guid Id,
    int? PartNumber,
    string AudioUrl,
    string? ContextDescription,
    IReadOnlyList<QuestionGroupDto> QuestionGroups);

public sealed record WritingTaskDto(
    Guid Id,
    int? TaskNumber,
    string PromptText,
    string? AssetsData,
    int MinWords);

public sealed record SpeakingPartDto(
    Guid Id,
    int? PartNumber,
    string? Description,
    IReadOnlyList<SpeakingQuestionDto> Questions);

public sealed record SpeakingQuestionDto(
    Guid Id,
    string Content,
    string? CueCardPoints,
    string? AudioPromptUrl,
    int? OrderIndex);

public sealed record QuestionGroupDto(
    Guid Id,
    string? GroupType,
    string? Instruction,
    string? ContentData,
    string? AssetsData,
    int? StartQuestion,
    int? EndQuestion,
    IReadOnlyList<QuestionDto> Questions);

public sealed record QuestionDto(
    Guid Id,
    int? QuestionNumber,
    string? Content,
    string? CorrectAnswer,
    string? Explanation,
    double Points,
    IReadOnlyList<QuestionOptionDto> Options);

public sealed record QuestionOptionDto(
    Guid Id,
    string OptionText,
    bool IsCorrect,
    int? OrderIndex);
