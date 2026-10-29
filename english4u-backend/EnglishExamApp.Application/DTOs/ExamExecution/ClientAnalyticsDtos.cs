namespace EnglishExamApp.Application.DTOs.ExamExecution;

// --- Dashboard DTOs ---
public sealed record ClientDashboardDto(
    ClientDashboardActiveSessionDto? ActiveSession,
    ClientDashboardSummaryDto Summary,
    string? WeakestSkill,
    IReadOnlyList<ClientDashboardSkillRowDto> SkillRows,
    IReadOnlyList<ClientDashboardRadarPointDto> RadarData,
    IReadOnlyList<ClientDashboardFluencyPointDto> FluencyTrend,
    IReadOnlyList<ClientDashboardRecentActivityDto> RecentActivities);

public sealed record ClientDashboardRecentActivityDto(
    Guid SessionId,
    Guid ExamId,
    string ExamTitle,
    string SkillType,
    string Status,
    double? BandScore,
    DateTime CompletedAt);

public sealed record ClientDashboardActiveSessionDto(
    Guid SessionId,
    Guid ExamId,
    string ExamTitle,
    string SkillType,
    string Status,
    int AnsweredQuestions,
    int TotalQuestions,
    int? TimeRemaining,
    DateTime StartedAt);

public sealed record ClientDashboardSummaryDto(
    int CompletedCount,
    int CompletedThisWeek,
    int WeeklyGoal,
    int WeeklyProgress,
    int TotalMinutes,
    int UniqueExamCount,
    double? AverageBand,
    double? BestBand,
    double? EstimatedOverallBand);

public sealed record ClientDashboardSkillRowDto(
    string Skill,
    int Attempts,
    int Completed,
    double? AverageBand,
    double? BestBand);

public sealed record ClientDashboardRadarPointDto(
    string Skill,
    string FullSkill,
    double Band);

public sealed record ClientDashboardFluencyPointDto(
    string Label,
    double Wpm,
    string ExamTitle,
    DateTime CompletedAt);

// --- Progress DTOs ---
public sealed record ClientProgressDto(
    ClientProgressStatsDto Stats,
    IReadOnlyList<ClientProgressChartPointDto> ChartData,
    IReadOnlyList<ClientProgressSkillAnalyticsDto> SkillAnalytics,
    IReadOnlyList<ClientProgressHistoryItemDto> History);

public sealed record ClientProgressStatsDto(
    int TotalMinutes,
    int CompletedCount,
    double? BestBand,
    double? AverageBand,
    int SkillsDoneCount,
    bool AllSkillsAttempted,
    int DailyStreakCount,
    int LongestStreakCount);

public sealed record ClientProgressChartPointDto(
    Guid SessionId,
    string Date,
    double Band,
    string Title,
    string Skill,
    DateTime CompletedAt);

public sealed record ClientProgressSkillAnalyticsDto(
    string Key,
    int Attempts,
    double? AvgScore,
    double? BestScore,
    string? ExtraMetric,
    string Advice);

public sealed record ClientProgressHistoryItemDto(
    Guid Key,
    string Title,
    string Skill,
    double? Score,
    int Duration,
    DateTime CompletedAt);

