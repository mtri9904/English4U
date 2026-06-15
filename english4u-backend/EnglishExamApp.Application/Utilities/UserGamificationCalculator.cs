namespace EnglishExamApp.Application.Utilities;

public sealed record UserGamificationProgressSnapshot(
    int ExperiencePoints,
    int CurrentLevel,
    int CurrentLevelStartExperience,
    int NextLevelExperience,
    int ExperienceToNextLevel,
    double LevelProgressPercent);

public static class UserGamificationCalculator
{
    private const int BaseLevelRequirement = 100;
    private const int LevelRequirementGrowth = 25;
    private const int BaseExperienceReward = 30;
    private const int MaxPerformanceBonus = 70;

    public static UserGamificationProgressSnapshot BuildProgress(int experiencePoints)
    {
        var normalizedExperience = Math.Max(0, experiencePoints);
        var currentLevel = CalculateLevel(normalizedExperience);
        var currentLevelStartExperience = GetLevelStartExperience(currentLevel);
        var nextLevelExperience = GetLevelStartExperience(currentLevel + 1);
        var experienceToNextLevel = Math.Max(0, nextLevelExperience - normalizedExperience);
        var currentLevelSpan = Math.Max(1, nextLevelExperience - currentLevelStartExperience);
        var levelProgressPercent = Math.Round(
            Math.Clamp((normalizedExperience - currentLevelStartExperience) * 100d / currentLevelSpan, 0d, 100d),
            1);

        return new UserGamificationProgressSnapshot(
            normalizedExperience,
            currentLevel,
            currentLevelStartExperience,
            nextLevelExperience,
            experienceToNextLevel,
            levelProgressPercent);
    }

    public static int CalculateLevel(int experiencePoints)
    {
        var normalizedExperience = Math.Max(0, experiencePoints);
        var level = 1;

        while (normalizedExperience >= GetLevelStartExperience(level + 1))
        {
            level += 1;
        }

        return level;
    }

    public static int GetLevelStartExperience(int level)
    {
        if (level <= 1)
        {
            return 0;
        }

        var completedLevelCount = level - 1;
        return completedLevelCount * BaseLevelRequirement
            + (completedLevelCount * (completedLevelCount - 1) / 2) * LevelRequirementGrowth;
    }

    public static int CalculateExperienceReward(double? totalBandScore, double accuracyPercent)
    {
        var performanceRatio = totalBandScore.HasValue
            ? Math.Clamp(totalBandScore.Value / 9d, 0d, 1d)
            : Math.Clamp(accuracyPercent / 100d, 0d, 1d);

        return BaseExperienceReward
            + (int)Math.Round(performanceRatio * MaxPerformanceBonus, MidpointRounding.AwayFromZero);
    }
}
