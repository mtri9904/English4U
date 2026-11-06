using EnglishExamApp.Application.DTOs.Exams;

namespace EnglishExamApp.Application.Interfaces;

public interface IPdfGenerationProgressTracker
{
    void Upsert(PdfGenerationProgressStatusDto snapshot);
    PdfGenerationProgressStatusDto? GetByClientRequestId(string clientRequestId);
    PdfGenerationProgressStatusDto? GetByUploadId(Guid uploadId);
    PdfGenerationProgressStatusDto? GetActiveJobByUserId(Guid userId);
    void RegisterCancellationTokenSource(Guid uploadId, string? clientRequestId, CancellationTokenSource cts);
    void UnregisterCancellationTokenSource(Guid uploadId, string? clientRequestId);
    bool TryCancelJob(string? clientRequestId, Guid? uploadId, Guid requestedBy);
}
