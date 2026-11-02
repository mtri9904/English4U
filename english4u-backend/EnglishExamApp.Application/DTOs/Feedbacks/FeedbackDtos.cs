namespace EnglishExamApp.Application.DTOs.Feedbacks;

public sealed record CreateFeedbackRequestDto(
    string Type, // BUG, IMPROVEMENT, QUESTION, OTHER
    string Priority, // LOW, MEDIUM, HIGH, URGENT
    string Title,
    string Description,
    string? SuggestedSolution = null,
    List<string>? AttachmentUrls = null,
    string? BrowserInfo = null,
    string? CurrentPageUrl = null
);

public sealed record FeedbackListItemDto(
    Guid Id,
    string Code,
    string Type,
    string Priority,
    string Title,
    string Status,
    string? CurrentPageUrl,
    string CreatedAt,
    string SenderName,
    string SenderRole
);

public sealed record FeedbackActivityLogDto(
    Guid Id,
    string Status,
    string Note,
    string ActorName,
    string CreatedAt,
    bool IsCurrent
);

public sealed record FeedbackDetailDto(
    Guid Id,
    string Code,
    string Type,
    string Priority,
    string Title,
    string Description,
    string? SuggestedSolution,
    List<string> Attachments,
    string? BrowserInfo,
    string? CurrentPageUrl,
    string Status,
    string SenderName,
    string SenderRole,
    string SenderEmail,
    string? AssignedAdminName,
    string CreatedAt,
    string UpdatedAt,
    List<FeedbackActivityLogDto> ActivityLogs
);

public sealed record UpdateFeedbackStatusRequestDto(
    string Status, // RECEIVED, IN_PROGRESS, RESOLVED, REJECTED
    string? Note = null,
    Guid? AssignedAdminId = null
);

public sealed record FeedbackPagedRequest(
    int PageNumber = 1,
    int PageSize = 10,
    string? Search = null,
    string? SearchTerm = null,
    string? Status = null,
    string? Type = null,
    string? Priority = null
);

public sealed record FeedbackStatsDto(
    int Total,
    int Received,
    int InProgress,
    int Resolved,
    int Rejected
);

