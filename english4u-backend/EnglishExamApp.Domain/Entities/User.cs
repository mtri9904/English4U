namespace EnglishExamApp.Domain.Entities;

public class User
{
    public Guid Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string? DisplayName { get; set; }
    public string? AvatarUrl { get; set; }
    public string Provider { get; set; } = "local";
    public string? Phone { get; set; }
    public string? Department { get; set; }
    public string? Position { get; set; }
    public string? Notes { get; set; }
    public DateTime? LastLoginAt { get; set; }
    public Guid? CreatedById { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<UserRole> UserRoles { get; set; } = [];
    public ICollection<UserSubscription> UserSubscriptions { get; set; } = [];
    public ICollection<Payment> Payments { get; set; } = [];
    public ICollection<Exam> CreatedExams { get; set; } = [];
    public ICollection<DocumentUpload> DocumentUploads { get; set; } = [];
    public ICollection<ExamSession> ExamSessions { get; set; } = [];
    public ICollection<SavedQuestion> SavedQuestions { get; set; } = [];
    public ICollection<Notification> Notifications { get; set; } = [];
}
