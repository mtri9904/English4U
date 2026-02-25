namespace EnglishLearningApp.Domain.Entities;

public class LearningProgress
{
    public Guid Id { get; set; }
    public Guid? UserId { get; set; }
    public Guid? CourseId { get; set; }
    public int CompletedLessons { get; set; } = 0;
    public DateTime LastAccessedAt { get; set; } = DateTime.UtcNow;

    public User? User { get; set; }
    public Course? Course { get; set; }
}
