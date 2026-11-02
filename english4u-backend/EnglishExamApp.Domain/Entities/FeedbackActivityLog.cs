namespace EnglishExamApp.Domain.Entities;

public class FeedbackActivityLog
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid FeedbackId { get; set; }
    public UserFeedback Feedback { get; set; } = null!;

    public string Status { get; set; } = "RECEIVED";
    public string Note { get; set; } = string.Empty;

    public Guid? ActorId { get; set; }
    public string ActorName { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

