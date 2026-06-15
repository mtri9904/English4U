using System.Net;
using System.Text;
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using Docnet.Core;
using Docnet.Core.Models;
using EnglishExamApp.Application.DTOs.Exams;
using EnglishExamApp.Application.Interfaces;
using EnglishExamApp.Application.Services;
using EnglishExamApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using UglyToad.PdfPig;
using UglyToad.PdfPig.Content;

namespace EnglishExamApp.Infrastructure.Services;

public sealed partial class GemmaPdfExamGenerationService
{

    private static string BuildTextPreview(string rawText)
    {
        if (string.IsNullOrWhiteSpace(rawText))
        {
            return "[empty]";
        }

        var normalized = Regex.Replace(rawText, @"\s+", " ").Trim();
        return normalized.Length <= 500
            ? normalized
            : normalized[..500] + "...";
    }

    private async Task PublishProgressAsync(
        Guid uploadId,
        Guid uploadedBy,
        string status,
        int progressPercent,
        string stage,
        string message,
        int? passageNumber = null,
        int? totalPassages = null,
        Guid? examId = null,
        string? clientRequestId = null,
        CancellationToken cancellationToken = default)
    {
        var progressSnapshot = new PdfGenerationProgressStatusDto(
            UploadId: uploadId,
            UploadedBy: uploadedBy,
            Status: status,
            ProgressPercent: Math.Clamp(progressPercent, 0, 100),
            Stage: stage,
            Message: message,
            PassageNumber: passageNumber,
            TotalPassages: totalPassages,
            ExamId: examId,
            ClientRequestId: string.IsNullOrWhiteSpace(clientRequestId) ? null : clientRequestId.Trim(),
            UpdatedAtUtc: DateTime.UtcNow);

        pdfGenerationProgressTracker.Upsert(progressSnapshot);

        var payload = new PdfGenerationProgressPayload(
            UploadId: progressSnapshot.UploadId,
            UploadedBy: progressSnapshot.UploadedBy,
            Status: progressSnapshot.Status,
            ProgressPercent: progressSnapshot.ProgressPercent,
            Stage: progressSnapshot.Stage,
            Message: progressSnapshot.Message,
            PassageNumber: progressSnapshot.PassageNumber,
            TotalPassages: progressSnapshot.TotalPassages,
            ExamId: progressSnapshot.ExamId,
            ClientRequestId: progressSnapshot.ClientRequestId);

        try
        {
            await realtimeEventPublisher.PublishAsync(
                PdfGenerationProgressEventType,
                payload,
                cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "Failed to publish realtime PDF generation progress for upload {UploadId}", uploadId);
        }
    }
}
