namespace EnglishExamApp.Domain.Entities;

public class ExamSession
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid ExamId { get; set; }
    public string? Status { get; set; }
    public DateTime StartedAt { get; set; } = DateTime.UtcNow;
    public DateTime? EndedAt { get; set; }
    public int? TimeRemaining { get; set; }

    public User User { get; set; } = null!;
    public Exam Exam { get; set; } = null!;
    public ICollection<UserAnswer> UserAnswers { get; set; } = [];
    public ICollection<ScoringResult> ScoringResults { get; set; } = [];
}
