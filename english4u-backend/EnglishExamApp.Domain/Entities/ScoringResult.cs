namespace EnglishExamApp.Domain.Entities;

public class ScoringResult
{
    public Guid Id { get; set; }
    public Guid SessionId { get; set; }
    public double? TotalBandScore { get; set; }
    public double? ReadingScore { get; set; }
    public double? ListeningScore { get; set; }
    public double? WritingScore { get; set; }
    public double? SpeakingScore { get; set; }
    public string? OverallFeedback { get; set; }
    public DateTime ScoredAt { get; set; } = DateTime.UtcNow;

    public ExamSession Session { get; set; } = null!;
}
