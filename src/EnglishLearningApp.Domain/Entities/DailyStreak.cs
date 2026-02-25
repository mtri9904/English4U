namespace EnglishLearningApp.Domain.Entities;

public class DailyStreak
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public int CurrentStreak { get; set; } = 0;
    public int LongestStreak { get; set; } = 0;
    public DateTime? LastActivityDate { get; set; }

    public User? User { get; set; }
}
