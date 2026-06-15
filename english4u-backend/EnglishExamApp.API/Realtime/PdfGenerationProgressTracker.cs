using System.Collections.Concurrent;
using EnglishExamApp.Application.DTOs.Exams;
using EnglishExamApp.Application.Interfaces;

namespace EnglishExamApp.API.Realtime;

public sealed class PdfGenerationProgressTracker : IPdfGenerationProgressTracker
{
    private readonly ConcurrentDictionary<string, PdfGenerationProgressStatusDto> _byClientRequestId = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<Guid, PdfGenerationProgressStatusDto> _byUploadId = new();

    public void Upsert(PdfGenerationProgressStatusDto snapshot)
    {
        _byUploadId[snapshot.UploadId] = snapshot;

        if (!string.IsNullOrWhiteSpace(snapshot.ClientRequestId))
        {
            _byClientRequestId[snapshot.ClientRequestId.Trim()] = snapshot;
        }
    }

    public PdfGenerationProgressStatusDto? GetByClientRequestId(string clientRequestId)
    {
        if (string.IsNullOrWhiteSpace(clientRequestId))
        {
            return null;
        }

        return _byClientRequestId.TryGetValue(clientRequestId.Trim(), out var snapshot)
            ? snapshot
            : null;
    }

    public PdfGenerationProgressStatusDto? GetByUploadId(Guid uploadId) =>
        _byUploadId.TryGetValue(uploadId, out var snapshot)
            ? snapshot
            : null;
}
