using EnglishExamApp.Application.DTOs.Exams;

namespace EnglishExamApp.Application.Interfaces;

public interface IPdfGenerationProgressTracker
{
    void Upsert(PdfGenerationProgressStatusDto snapshot);
    PdfGenerationProgressStatusDto? GetByClientRequestId(string clientRequestId);
    PdfGenerationProgressStatusDto? GetByUploadId(Guid uploadId);
}
