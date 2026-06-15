namespace EnglishExamApp.Application.DTOs.Exams;

public sealed record GenerateListeningTranscriptRequestDto(
    string AudioUrl,
    string? Language = "en");

public sealed record ListeningTranscriptSegmentDto(
    double StartTime,
    double? EndTime,
    string Text,
    int? IsTargetForQuestion = null);

public sealed record GenerateListeningTranscriptResultDto(
    IReadOnlyList<ListeningTranscriptSegmentDto> Segments,
    string TranscriptText,
    int SegmentCount);

public sealed record ListeningTranscriptAlignmentQuestionDto(
    int QuestionNumber,
    string? QuestionText,
    string? CorrectAnswer,
    IReadOnlyList<string>? CorrectOptionTexts,
    string? ContextText,
    string? GroupType);

public sealed record AlignListeningTranscriptRequestDto(
    IReadOnlyList<ListeningTranscriptSegmentDto> TranscriptSegments,
    IReadOnlyList<ListeningTranscriptAlignmentQuestionDto> Questions);

public sealed record ListeningTranscriptQuestionAlignmentDto(
    int QuestionNumber,
    IReadOnlyList<int> SegmentIndexes,
    string? Confidence = null);

public sealed record AlignListeningTranscriptResultDto(
    IReadOnlyList<ListeningTranscriptQuestionAlignmentDto> Alignments);
