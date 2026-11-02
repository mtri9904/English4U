namespace EnglishExamApp.Application.DTOs.ExamExecution;

public record AdminAttemptStatsDto(
    int TotalAttempts,
    int CompletedAttempts,
    int InProgressAttempts,
    int AbandonedAttempts,
    double? AverageScore,
    int UniqueUsersCount
);

