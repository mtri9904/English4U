namespace EnglishExamApp.Application.DTOs.ExamExecution;

public sealed record AutoSaveAnswerDto(
    Guid SessionId,
    Guid QuestionId,
    string? AnswerText);

public sealed record PracticeSessionAnswerInputDto(
    Guid? QuestionId,
    Guid? WritingTaskId,
    Guid? SpeakingQuestionId,
    string? AnswerText,
    string? AudioUrl = null,
    double? DurationSeconds = null,
    int? FileSizeKB = null);

public sealed record UpdatePracticeSessionAnswersDto(
    int? TimeRemaining,
    IReadOnlyList<PracticeSessionAnswerInputDto>? Answers);

public sealed record PracticeSessionStartDto(
    Guid SessionId,
    Guid ExamId,
    string SkillType,
    string Status,
    int? TimeRemaining,
    bool IsResumed);

public sealed record PracticeSessionResultDto(
    Guid SessionId,
    double? ReadingScore,
    double? ListeningScore,
    double TotalAutoScore,
    double MaxAutoScore,
    int TotalQuestions,
    int AnsweredQuestions,
    int CorrectQuestions,
    double AccuracyPercent,
    string Status,
    double? WritingScore = null,
    string? OverallFeedback = null,
    double? SpeakingScore = null);

public sealed record PracticeSessionFeedbackDto(
    string Criteria,
    double BandScore,
    string? Comment,
    string? Improvements);

public sealed record PracticeSessionSpeakingAnalyticsDto(
    int WordCount,
    double? WordsPerMinute,
    double? CoverageRatio,
    int? TargetDurationSeconds,
    double? EstimatedFluencyBand,
    string PaceLabel,
    string CoverageLabel);

public sealed record PracticeSessionSpeakingPromptCueDto(
    string Code,
    int StartMs,
    int EndMs);

public sealed record PracticeSessionAnswerDto(
    Guid QuestionId,
    Guid? WritingTaskId,
    int? QuestionNumber,
    int? WritingTaskNumber,
    string? GroupType,
    string? AnswerText,
    string? CorrectAnswer,
    double ScoreEarned,
    bool? IsCorrect,
    IReadOnlyList<PracticeSessionFeedbackDto>? Feedbacks = null,
    Guid? SpeakingQuestionId = null,
    int? SpeakingQuestionOrderIndex = null,
    int? SpeakingPartNumber = null,
    string? AudioUrl = null,
    double? DurationSeconds = null,
    string? TranscriptText = null,
    PracticeSessionSpeakingAnalyticsDto? SpeakingAnalytics = null);

public sealed record PracticeSessionOptionDto(
    Guid Id,
    string OptionText,
    string? ImageUrl,
    int? OrderIndex);

public sealed record PracticeSessionQuestionDto(
    Guid Id,
    int? QuestionNumber,
    string? Content,
    double Points,
    string? CorrectAnswer,
    IReadOnlyList<PracticeSessionOptionDto> Options);

public sealed record PracticeSessionQuestionGroupDto(
    Guid Id,
    string? GroupType,
    string? Instruction,
    string? ContentData,
    string? AssetsData,
    int? StartQuestion,
    int? EndQuestion,
    IReadOnlyList<PracticeSessionQuestionDto> Questions);

public sealed record PracticeSessionReadingPassageDto(
    Guid Id,
    int? PassageNumber,
    string? Title,
    string? ParagraphsData,
    string? AssetsData,
    IReadOnlyList<PracticeSessionQuestionGroupDto> QuestionGroups);

public sealed record PracticeSessionListeningPartDto(
    Guid Id,
    int? PartNumber,
    string AudioUrl,
    string? ContextDescription,
    string? TranscriptData,
    IReadOnlyList<PracticeSessionQuestionGroupDto> QuestionGroups);

public sealed record PracticeSessionWritingTaskDto(
    Guid Id,
    int? TaskNumber,
    string PromptText,
    string? AssetsData,
    int MinWords);

public sealed record PracticeSessionSpeakingQuestionDto(
    Guid Id,
    string Content,
    string? CueCardPoints,
    string? AudioPromptUrl,
    int? OrderIndex,
    int? PromptEstimatedDurationMs = null,
    IReadOnlyList<PracticeSessionSpeakingPromptCueDto>? PromptVisemeTimeline = null);

public sealed record PracticeSessionSpeakingPartDto(
    Guid Id,
    int? PartNumber,
    string? Description,
    IReadOnlyList<PracticeSessionSpeakingQuestionDto> Questions);

public sealed record PracticeSessionSectionDto(
    Guid Id,
    string SkillType,
    string? Title,
    int? OrderIndex,
    IReadOnlyList<PracticeSessionReadingPassageDto> ReadingPassages,
    IReadOnlyList<PracticeSessionListeningPartDto> ListeningParts,
    IReadOnlyList<PracticeSessionWritingTaskDto> WritingTasks,
    IReadOnlyList<PracticeSessionSpeakingPartDto> SpeakingParts);

public sealed record PracticeSessionExamDto(
    Guid Id,
    string Title,
    string? Description,
    int? DurationMinutes,
    string? ExamType,
    IReadOnlyList<PracticeSessionSectionDto> Sections);

public sealed record PracticeSessionDto(
    Guid SessionId,
    Guid ExamId,
    string ExamTitle,
    string? ExamDescription,
    string? ExamType,
    string SkillType,
    string Status,
    DateTime StartedAt,
    DateTime? EndedAt,
    int? DurationMinutes,
    int? TimeRemaining,
    int TotalQuestions,
    int AnsweredQuestions,
    int? ResumeQuestionNumber,
    PracticeSessionExamDto Exam,
    IReadOnlyList<PracticeSessionAnswerDto> Answers,
    PracticeSessionResultDto? Result);

public sealed record PracticeSessionListItemDto(
    Guid SessionId,
    Guid ExamId,
    string ExamTitle,
    string? ExamType,
    string SkillType,
    string Status,
    DateTime StartedAt,
    DateTime? EndedAt,
    int? TimeRemaining,
    int TotalQuestions,
    int AnsweredQuestions,
    int? ResumeQuestionNumber,
    double? ReadingScore,
    double? ListeningScore,
    double? TotalAutoScore,
    double? WritingScore = null,
    double? SpeakingScore = null);

public sealed record UploadPracticeSpeakingRecordingDto(
    Guid SpeakingQuestionId,
    string? AnswerText,
    double? DurationSeconds = null);

public sealed record PracticeSessionSpeakingUploadResultDto(
    Guid SpeakingQuestionId,
    string AudioUrl,
    int FileSizeKB,
    double? DurationSeconds,
    string? TranscriptText,
    int TranscriptSegmentCount,
    string? AnswerText,
    PracticeSessionSpeakingAnalyticsDto? SpeakingAnalytics = null);

public sealed record AdminAttemptQueryDto(
    string? Status,
    string? Search);

public sealed record AdminAttemptListItemDto(
    Guid SessionId,
    Guid ExamId,
    Guid UserId,
    string ExamTitle,
    string? ExamType,
    string SkillType,
    string UserDisplayName,
    string UserEmail,
    string Status,
    DateTime StartedAt,
    DateTime? EndedAt,
    int? TimeRemaining,
    int TotalQuestions,
    int AnsweredQuestions,
    int? ResumeQuestionNumber,
    double? ReadingScore,
    double? ListeningScore,
    double? TotalAutoScore);

public sealed record AdminAttemptAnswerDto(
    Guid QuestionId,
    int? QuestionNumber,
    string? GroupType,
    string? QuestionContent,
    string? SubmittedAnswer,
    double ScoreEarned,
    bool? IsCorrect);

public sealed record AdminAttemptDetailDto(
    Guid SessionId,
    Guid ExamId,
    Guid UserId,
    string ExamTitle,
    string? ExamType,
    string SkillType,
    string UserDisplayName,
    string UserEmail,
    string Status,
    DateTime StartedAt,
    DateTime? EndedAt,
    int? TimeRemaining,
    int TotalQuestions,
    int AnsweredQuestions,
    int? ResumeQuestionNumber,
    PracticeSessionResultDto? Result,
    IReadOnlyList<AdminAttemptAnswerDto> Answers);

public sealed record SubmitExamResultDto(
    Guid SessionId,
    double ReadingScore,
    double ListeningScore,
    double TotalAutoScore,
    bool HasWriting,
    bool HasSpeaking,
    string Status);
