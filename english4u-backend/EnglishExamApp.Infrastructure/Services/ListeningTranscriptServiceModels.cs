using System.Text.Json.Serialization;

namespace EnglishExamApp.Infrastructure.Services;

internal sealed record ListeningTranscriptServiceResponse(
    [property: JsonPropertyName("segments")] List<ListeningTranscriptServiceSegment>? Segments,
    [property: JsonPropertyName("transcript_text")] string? TranscriptText);

internal sealed record ListeningTranscriptServiceSegment(
    [property: JsonPropertyName("start_time")] double StartTime,
    [property: JsonPropertyName("end_time")] double? EndTime,
    [property: JsonPropertyName("text")] string Text);

internal sealed record ListeningTranscriptAlignmentServiceResponse(
    [property: JsonPropertyName("alignments")] List<ListeningTranscriptAlignmentServiceItem>? Alignments);

internal sealed record ListeningTranscriptAlignmentServiceItem(
    [property: JsonPropertyName("question_number")] int QuestionNumber,
    [property: JsonPropertyName("segment_indexes")] List<int>? SegmentIndexes,
    [property: JsonPropertyName("confidence")] string? Confidence);
