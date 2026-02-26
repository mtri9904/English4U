namespace EnglishLearningApp.Domain.Entities;

public class User
{
    public Guid Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string? DisplayName { get; set; }
    public string? Role { get; set; }
    public string? AvatarUrl { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<Course> CreatedCourses { get; set; } = [];
    public ICollection<ExamSession> ExamSessions { get; set; } = [];
    public ICollection<LearningProgress> LearningProgresses { get; set; } = [];
    public ICollection<Notification> Notifications { get; set; } = [];
    public ICollection<Payment> Payments { get; set; } = [];
    public ICollection<UserSubscription> UserSubscriptions { get; set; } = [];
    public ICollection<UserAchievement> UserAchievements { get; set; } = [];
    public ICollection<UserFlashcardProgress> UserFlashcardProgresses { get; set; } = [];
    public ICollection<CourseReview> CourseReviews { get; set; } = [];
    public ICollection<LessonComment> LessonComments { get; set; } = [];
    public ICollection<FlashcardDeck> FlashcardDecks { get; set; } = [];
    public ICollection<Exam> CreatedExams { get; set; } = [];
    public ICollection<UserUpload> UserUploads { get; set; } = [];
    public DailyStreak? DailyStreak { get; set; }
}
