namespace EnglishLearningApp.Application.ScoringResults.DTOs;

public record ScoringResultDetail(
    Guid Id,
    Guid? SessionId,
    double? TotalScore,
    double? BandScore,
    string? Transcript,
    string? Feedback,
    double? PronunciationScore,
    double? FluencyScore,
    double? GrammarScore,
    double? CoherenceScore,
    DateTime ScoredAt
);
