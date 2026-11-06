namespace EnglishExamApp.Application.DTOs.Leaderboard;

public class LeaderboardItemDto
{
    public int Rank { get; set; }
    public Guid UserId { get; set; }
    public string DisplayName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? AvatarUrl { get; set; }
    public double PrimaryMetricValue { get; set; }
    public string PrimaryMetricLabel { get; set; } = string.Empty;
    public string SecondaryMetricLabel { get; set; } = string.Empty;
    public int ExperiencePoints { get; set; }
    public int DailyStreakCount { get; set; }
    public int LongestStreakCount { get; set; }
    public double TotalStudyHours { get; set; }
    public int ExamsCompletedCount { get; set; }
    public double? AverageBandScore { get; set; }
    public string? TopBadge { get; set; }
    public bool IsCurrentUser { get; set; }
}

public class BadgeItemDto
{
    public string Id { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Category { get; set; } = "general"; // ielts, streak, diligence, special
    public string Tier { get; set; } = "bronze"; // bronze, silver, gold, diamond
    public string Icon { get; set; } = "🏆";
    public bool Unlocked { get; set; }
    public DateTime? UnlockedAt { get; set; }
    public double CurrentProgress { get; set; }
    public double TargetProgress { get; set; }
    public string ProgressUnit { get; set; } = string.Empty;
    public int XpReward { get; set; }
}

public class WeeklyQuestDto
{
    public string Id { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Category { get; set; } = "reading"; // reading, streak, dictation, flashcard, exam
    public string Icon { get; set; } = "🎯";
    public int CurrentProgress { get; set; }
    public int TargetProgress { get; set; }
    public string ProgressLabel { get; set; } = string.Empty;
    public int XpReward { get; set; }
    public bool IsCompleted { get; set; }
    public bool IsClaimed { get; set; }
    public string ActionUrl { get; set; } = "/app/practice";
    public int RemainingDays { get; set; } = 7;
}

public class UserGamificationHeaderDto
{
    public int CurrentRank { get; set; }
    public int TotalXp { get; set; }
    public int Level { get; set; }
    public int NextLevelXp { get; set; }
    public int DailyStreak { get; set; }
    public int BadgesUnlockedCount { get; set; }
    public int TotalBadgesCount { get; set; }
    public int QuestsCompletedCount { get; set; }
    public int TotalQuestsCount { get; set; }
}

public class LeaderboardOverviewDto
{
    public string Category { get; set; } = "diligence"; // diligence, streak, score
    public string Period { get; set; } = "week"; // week, month, all
    public List<LeaderboardItemDto> Rankings { get; set; } = [];
    public LeaderboardItemDto? CurrentUserRank { get; set; }
    public int TotalParticipants { get; set; }
    public List<BadgeItemDto> Badges { get; set; } = [];
    public List<WeeklyQuestDto> WeeklyQuests { get; set; } = [];
    public UserGamificationHeaderDto UserSummary { get; set; } = new();
}

public class ClaimQuestRewardResponseDto
{
    public bool Success { get; set; }
    public string QuestId { get; set; } = string.Empty;
    public int XpEarned { get; set; }
    public int TotalXp { get; set; }
    public string Message { get; set; } = string.Empty;
}

public class AdminBadgeStatDto
{
    public string Id { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string Tier { get; set; } = string.Empty;
    public string Icon { get; set; } = string.Empty;
    public int UnlockedCount { get; set; }
    public double UnlockedPercentage { get; set; }
    public int XpReward { get; set; }
}

public class AdminQuestStatDto
{
    public string Id { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string Icon { get; set; } = string.Empty;
    public int Target { get; set; }
    public int CompletedLearnersCount { get; set; }
    public double CompletionRate { get; set; }
    public int XpReward { get; set; }
}

public class AdminLeaderboardOverviewDto
{
    public string Category { get; set; } = "diligence";
    public string Period { get; set; } = "week";
    public int TotalLearners { get; set; }
    public int ActiveLearners { get; set; }
    public double TotalStudyHours { get; set; }
    public int TotalExamsCompleted { get; set; }
    public double AverageBandScore { get; set; }
    public int HighestStreak { get; set; }
    public int TotalXpAwarded { get; set; }
    public List<LeaderboardItemDto> Rankings { get; set; } = [];
    public List<AdminBadgeStatDto> BadgeDistribution { get; set; } = [];
    public List<AdminQuestStatDto> QuestOverview { get; set; } = [];
}
