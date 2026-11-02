namespace EnglishExamApp.Application.DTOs.Exams;

public record ExamStatsDto(
    int TotalExams,
    int PublishedExams,
    int DraftExams,
    int AverageDurationMinutes
);

