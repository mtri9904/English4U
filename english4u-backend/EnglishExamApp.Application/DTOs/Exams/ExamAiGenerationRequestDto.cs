namespace EnglishExamApp.Application.DTOs.Exams;

public record ExamAiGenerationRequestDto(
    string InputMode,
    string? TopicDescription,
    string? FileUrl,
    string? LanguageCode = "en"
);
