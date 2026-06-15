using EnglishExamApp.Application.DTOs.Exams;

namespace EnglishExamApp.Application.Services;

public interface IExamAiGenerationService
{
    Task<GenerateExamFromPdfResultDto> GenerateExamAiAsync(
        Stream? fileStream,
        string? fileName,
        ExamAiGenerationRequestDto request,
        Guid createdBy,
        string? clientRequestId = null,
        Guid? uploadId = null,
        CancellationToken cancellationToken = default);
}
