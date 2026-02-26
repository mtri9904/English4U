namespace EnglishLearningApp.Domain.Entities;

public class ExamSession
{
    public Guid Id { get; set; }
    public Guid? UserId { get; set; }
    public Guid? ExamId { get; set; }
    public string? Status { get; set; }
    public DateTime StartedAt { get; set; } = DateTime.UtcNow;
    public DateTime? EndedAt { get; set; }
    public int? TimeRemaining { get; set; }
    public string? DraftData { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public User? User { get; set; }
    public Exam? Exam { get; set; }
    public ICollection<UserAnswer> UserAnswers { get; set; } = [];
    public ScoringResult? ScoringResult { get; set; }
}
