namespace EnglishExamApp.Application.DTOs.ExamExecution;

public record MyPracticeStatsDto(
    int TotalSessions,
    int InProgressCount,
    int CompletedCount,
    double AverageScore
);

