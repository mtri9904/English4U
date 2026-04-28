namespace EnglishExamApp.Application.DTOs.Users;

public sealed record UserGamificationDto(
    int ExperiencePoints,
    int CurrentLevel,
    int CurrentLevelStartExperience,
    int NextLevelExperience,
    int ExperienceToNextLevel,
    double LevelProgressPercent,
    int DailyStreakCount,
    int LongestStreakCount,
    string? LastActivityAt);

public sealed record UserLearningSnapshotDto(
    int CompletedSessionCount,
    int UniqueExamCompletedCount,
    double? AverageBandScore,
    double? BestBandScore,
    int TotalPracticeMinutes);

public sealed record UserProfileRecentExamDto(
    Guid SessionId,
    Guid ExamId,
    string ExamTitle,
    string SkillType,
    string CompletedAt,
    double? BandScore);

public sealed record UserProfileDto(
    Guid Id,
    string Email,
    string? DisplayName,
    string? AvatarUrl,
    string? Phone,
    string? Department,
    string? Position,
    string? Notes,
    bool IsActive,
    bool IsOnline,
    string? LastSeenAt,
    string? LastLoginAt,
    string? Role,
    string CreatedAt,
    UserGamificationDto Gamification,
    UserLearningSnapshotDto Learning,
    IReadOnlyList<UserProfileRecentExamDto> RecentExamActivities);
