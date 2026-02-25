namespace EnglishLearningApp.Domain.Entities;

public class Achievement
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? IconUrl { get; set; }
    public int PointsReward { get; set; } = 0;

    public ICollection<UserAchievement> UserAchievements { get; set; } = [];
}
