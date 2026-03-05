namespace EnglishExamApp.Application.DTOs.Exams;

public sealed record CreateExamDto(
    string Title,
    string? Description,
    int? DurationMinutes,
    double? TotalPoints,
    string? ExamType,
    bool IsPublished,
    List<CreateSectionDto> Sections);

public sealed record CreateSectionDto(
    string SkillType,
    string? Title,
    int? OrderIndex,
    List<CreateReadingPassageDto>? ReadingPassages,
    List<CreateListeningPartDto>? ListeningParts,
    List<CreateWritingTaskDto>? WritingTasks,
    List<CreateSpeakingPartDto>? SpeakingParts);

public sealed record CreateReadingPassageDto(
    int? PassageNumber,
    string? Title,
    string? ParagraphsData,
    string? AssetsData,
    List<CreateQuestionGroupDto> QuestionGroups);

public sealed record CreateListeningPartDto(
    int? PartNumber,
    string AudioUrl,
    string? ContextDescription,
    List<CreateQuestionGroupDto> QuestionGroups);

public sealed record CreateWritingTaskDto(
    int? TaskNumber,
    string PromptText,
    string? AssetsData,
    int MinWords);

public sealed record CreateSpeakingPartDto(
    int? PartNumber,
    string? Description,
    List<CreateSpeakingQuestionDto> Questions);

public sealed record CreateSpeakingQuestionDto(
    string Content,
    string? CueCardPoints,
    string? AudioPromptUrl,
    int? OrderIndex);

public sealed record CreateQuestionGroupDto(
    string? GroupType,
    string? Instruction,
    string? ContentData,
    string? AssetsData,
    int? StartQuestion,
    int? EndQuestion,
    List<CreateQuestionDto> Questions);

public sealed record CreateQuestionDto(
    int? QuestionNumber,
    string? Content,
    string? CorrectAnswer,
    string? Explanation,
    double Points,
    List<CreateQuestionOptionDto> Options);

public sealed record CreateQuestionOptionDto(
    string OptionText,
    bool IsCorrect,
    int? OrderIndex);
