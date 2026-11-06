using System.Collections.Concurrent;
using EnglishExamApp.Application.DTOs.Exams;
using EnglishExamApp.Application.Interfaces;

namespace EnglishExamApp.API.Realtime;

public sealed class PdfGenerationProgressTracker : IPdfGenerationProgressTracker
{
    private readonly ConcurrentDictionary<string, PdfGenerationProgressStatusDto> _byClientRequestId = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<Guid, PdfGenerationProgressStatusDto> _byUploadId = new();
    private readonly ConcurrentDictionary<string, CancellationTokenSource> _ctsByClientRequestId = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<Guid, CancellationTokenSource> _ctsByUploadId = new();

    public void Upsert(PdfGenerationProgressStatusDto snapshot)
    {
        _byUploadId[snapshot.UploadId] = snapshot;

        if (!string.IsNullOrWhiteSpace(snapshot.ClientRequestId))
        {
            _byClientRequestId[snapshot.ClientRequestId.Trim()] = snapshot;
        }

        CleanupExpiredSnapshots();
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

    public PdfGenerationProgressStatusDto? GetActiveJobByUserId(Guid userId)
    {
        return _byUploadId.Values.FirstOrDefault(s =>
            s.UploadedBy == userId &&
            s.Status.Equals("processing", StringComparison.OrdinalIgnoreCase));
    }

    public void RegisterCancellationTokenSource(Guid uploadId, string? clientRequestId, CancellationTokenSource cts)
    {
        _ctsByUploadId[uploadId] = cts;

        if (!string.IsNullOrWhiteSpace(clientRequestId))
        {
            _ctsByClientRequestId[clientRequestId.Trim()] = cts;
        }
    }

    public void UnregisterCancellationTokenSource(Guid uploadId, string? clientRequestId)
    {
        _ctsByUploadId.TryRemove(uploadId, out _);

        if (!string.IsNullOrWhiteSpace(clientRequestId))
        {
            _ctsByClientRequestId.TryRemove(clientRequestId.Trim(), out _);
        }
    }

    public bool TryCancelJob(string? clientRequestId, Guid? uploadId, Guid requestedBy)
    {
        var snapshot = !string.IsNullOrWhiteSpace(clientRequestId)
            ? GetByClientRequestId(clientRequestId)
            : uploadId.HasValue ? GetByUploadId(uploadId.Value) : null;

        if (snapshot is null || snapshot.UploadedBy != requestedBy)
        {
            return false;
        }

        CancellationTokenSource? cts = null;
        if (!string.IsNullOrWhiteSpace(clientRequestId) && _ctsByClientRequestId.TryGetValue(clientRequestId.Trim(), out var ctsByReq))
        {
            cts = ctsByReq;
        }
        else if (uploadId.HasValue && _ctsByUploadId.TryGetValue(uploadId.Value, out var ctsByUp))
        {
            cts = ctsByUp;
        }

        try
        {
            cts?.Cancel();
        }
        catch (ObjectDisposedException)
        {
            // Ignored if already disposed
        }

        var canceledSnapshot = new PdfGenerationProgressStatusDto(
            UploadId: snapshot.UploadId,
            UploadedBy: snapshot.UploadedBy,
            Status: "failed",
            ProgressPercent: snapshot.ProgressPercent,
            Stage: "canceled",
            Message: "Tiến trình tạo đề đã được hủy theo yêu cầu của bạn.",
            PassageNumber: snapshot.PassageNumber,
            TotalPassages: snapshot.TotalPassages,
            ExamId: snapshot.ExamId,
            ClientRequestId: snapshot.ClientRequestId,
            UpdatedAtUtc: DateTime.UtcNow);

        Upsert(canceledSnapshot);
        return true;
    }

    private void CleanupExpiredSnapshots()
    {
        // Periodically evict completed or failed jobs older than 1 hour to prevent memory leaks
        if (_byUploadId.Count < 50)
        {
            return;
        }

        var cutoff = DateTime.UtcNow.AddHours(-1);
        foreach (var (uploadId, snapshot) in _byUploadId)
        {
            if (!snapshot.Status.Equals("processing", StringComparison.OrdinalIgnoreCase) && snapshot.UpdatedAtUtc < cutoff)
            {
                _byUploadId.TryRemove(uploadId, out _);
                if (!string.IsNullOrWhiteSpace(snapshot.ClientRequestId))
                {
                    _byClientRequestId.TryRemove(snapshot.ClientRequestId, out _);
                }
            }
        }
    }
}
