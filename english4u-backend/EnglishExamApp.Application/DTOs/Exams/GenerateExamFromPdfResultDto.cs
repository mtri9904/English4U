namespace EnglishExamApp.Application.DTOs.Exams;

public sealed record GenerateExamFromPdfResultDto(
    Guid ExamId,
    Guid UploadId,
    int PassageCount,
    int QuestionCount);
