namespace EnglishExamApp.Application.DTOs.Exams;

public sealed record PdfGenerationProgressStatusDto(
    Guid UploadId,
    Guid UploadedBy,
    string Status,
    int ProgressPercent,
    string Stage,
    string Message,
    int? PassageNumber,
    int? TotalPassages,
    Guid? ExamId,
    string? ClientRequestId,
    DateTime UpdatedAtUtc);
