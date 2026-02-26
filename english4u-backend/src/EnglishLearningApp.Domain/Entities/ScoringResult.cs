namespace EnglishLearningApp.Domain.Entities;

public class ScoringResult
{
    public Guid Id { get; set; }
    public Guid? SessionId { get; set; }
    public double? TotalScore { get; set; }
    public double? BandScore { get; set; }
    public string? Transcript { get; set; }
    public string? Feedback { get; set; }
    public double? PronunciationScore { get; set; }
    public double? FluencyScore { get; set; }
    public double? GrammarScore { get; set; }
    public double? CoherenceScore { get; set; }
    public DateTime ScoredAt { get; set; } = DateTime.UtcNow;

    public ExamSession? Session { get; set; }
}
