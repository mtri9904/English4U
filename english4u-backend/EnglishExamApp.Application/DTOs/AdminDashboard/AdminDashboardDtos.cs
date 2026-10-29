using EnglishExamApp.Application.DTOs.ExamExecution;

namespace EnglishExamApp.Application.DTOs.AdminDashboard;

public sealed record AdminDashboardDto(
    AdminDashboardUserStatsDto UserStats,
    int PublishedExamsCount,
    int DraftExamsCount,
    int AttemptsCount,
    int CompletedAttempts,
    int InProgressAttempts,
    int AbandonedAttempts,
    IReadOnlyList<AdminExamTypeCountDto> ExamByType,
    IReadOnlyList<AdminSkillAttemptCountDto> AttemptsBySkill,
    IReadOnlyList<AdminTopExamDto> TopExams,
    IReadOnlyList<AdminAttemptListItemDto> RecentAttempts);

public sealed record AdminDashboardUserStatsDto(
    int TotalUsers,
    int ActiveUsers,
    int OnlineUsers,
    double GlobalAverageScore,
    int PremiumUsers);

public sealed record AdminExamTypeCountDto(string Name, int Count);

public sealed record AdminSkillAttemptCountDto(string Name, int Value);

public sealed record AdminTopExamDto(string Title, string Type, int Count);

