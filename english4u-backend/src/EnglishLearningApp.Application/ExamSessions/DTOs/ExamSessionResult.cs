namespace EnglishLearningApp.Application.ExamSessions.DTOs;

public record ExamSessionResult(
    Guid Id,
    Guid? UserId,
    Guid? ExamId,
    string? Status,
    DateTime StartedAt,
    DateTime? EndedAt,
    int? TimeRemaining,
    string? DraftData,
    DateTime CreatedAt
);
