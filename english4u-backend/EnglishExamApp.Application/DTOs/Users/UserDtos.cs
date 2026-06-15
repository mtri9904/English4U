namespace EnglishExamApp.Application.DTOs.Users;

public record UserOverviewDto(
    Guid Id,
    string Email,
    string? DisplayName,
    string? AvatarUrl,
    string? Phone,
    bool IsActive,
    bool IsOnline,
    string CreatedAt,
    string? LastLoginAt,
    string? LastSeenAt,
    string RoleName,
    string? SubscriptionName, // Gói: Premium, Pro, Free
    string? CurrentLevel,     // Trình độ: B2, B1, A2...
    double AverageScore       // Điểm TB
);

public record UserDetailDto(
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
    string CreatedAt,
    string? LastLoginAt,
    string? LastSeenAt,
    string RoleName,
    string? SubscriptionName,
    string? CurrentLevel,
    int TotalExamsTaken,
    double AverageScore,
    List<UserSessionHistoryDto> RecentSessions
);

public record UserSessionHistoryDto(
    Guid SessionId,
    string ExamTitle,
    string CompletedAt,
    double Score
);

public record UserManagementStatsDto(
    int TotalUsers,
    int ActiveUsers,
    int OnlineUsers,
    double GlobalAverageScore,
    int PremiumUsers
);

public record UserPagedRequest(
    int PageNumber = 1,
    int PageSize = 10,
    string? SearchTerm = null,
    bool? IsActive = null,
    string? SubscriptionId = null,
    string? SortBy = "CreatedAt",
    bool SortDescending = true
);

public record PagedResult<T>(
    List<T> Items,
    int TotalCount,
    int PageNumber,
    int PageSize
);
