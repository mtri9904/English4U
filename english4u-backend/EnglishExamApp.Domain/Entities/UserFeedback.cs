namespace EnglishExamApp.Domain.Entities;

public class UserFeedback
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Code { get; set; } = string.Empty;

    public Guid UserId { get; set; }
    public User User { get; set; } = null!;

    public string Type { get; set; } = "BUG"; // BUG, IMPROVEMENT, QUESTION, OTHER
    public string Priority { get; set; } = "MEDIUM"; // LOW, MEDIUM, HIGH, URGENT

    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string? SuggestedSolution { get; set; }

    public string? AttachmentsJson { get; set; } // JSON array of string URLs
    public string? BrowserInfo { get; set; }
    public string? CurrentPageUrl { get; set; }

    public string Status { get; set; } = "RECEIVED"; // RECEIVED, IN_PROGRESS, RESOLVED, REJECTED

    public Guid? AssignedAdminId { get; set; }
    public User? AssignedAdmin { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<FeedbackActivityLog> ActivityLogs { get; set; } = [];
}

