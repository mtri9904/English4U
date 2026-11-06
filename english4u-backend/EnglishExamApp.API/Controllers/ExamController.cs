using EnglishExamApp.API.Realtime;
using EnglishExamApp.API.Authentication;
using EnglishExamApp.Application.DTOs.Exams;
using EnglishExamApp.Application.Interfaces;
using EnglishExamApp.Application.Realtime;
using EnglishExamApp.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EnglishExamApp.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Admin")]
public class ExamController(
    IExamService examService,
    IExamPdfGenerationService examPdfGenerationService,
    IExamAiGenerationService examAiGenerationService,
    IAiIntegrationService aiIntegrationService,
    ISpeakingMediaStorageService speakingMediaStorageService,
    IWritingVisualExtractionService writingVisualExtractionService,
    IPdfGenerationProgressTracker pdfGenerationProgressTracker,
    IRealtimeEventDispatcher realtimeDispatcher,
    ILogger<ExamController> logger,
    ICurrentUserService currentUser) : ControllerBase
{
    private const long MaxSpeakingPromptAudioBytes = 30 * 1024 * 1024;

    private static readonly HashSet<string> AllowedSpeakingPromptAudioExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".aac",
        ".flac",
        ".m4a",
        ".mp3",
        ".ogg",
        ".wav",
        ".webm",
    };

    [HttpGet]
    public async Task<IResult> GetAll([FromQuery] ExamPagedRequest request, CancellationToken cancellationToken)
    {
        var result = await examService.GetPagedExamsAsync(request, cancellationToken);
        return TypedResults.Ok(result);
    }

    [HttpGet("stats")]
    public async Task<IResult> GetExamStats(CancellationToken cancellationToken)
    {
        var stats = await examService.GetExamStatsAsync(cancellationToken);
        return TypedResults.Ok(stats);
    }

    [HttpGet("{examId:guid}")]
    public async Task<IResult> GetExamDetail(Guid examId, CancellationToken cancellationToken)
    {
        var exam = await examService.GetExamDetailAsync(examId, cancellationToken);

        return exam is null
            ? TypedResults.NotFound(new { message = "Exam not found." })
            : TypedResults.Ok(exam);
    }

    [HttpPost]
    public async Task<IResult> CreateExam(
        [FromBody] CreateExamDto dto,
        CancellationToken cancellationToken)
    {
        if (!currentUser.TryGetUserId(out var createdBy))
        {
            return TypedResults.Unauthorized();
        }

        Guid examId;
        try
        {
            examId = await examService.CreateExamAsync(dto, createdBy, cancellationToken);
            await PublishExamChangedAsync(cancellationToken);
        }
        catch (InvalidOperationException ex)
        {
            return TypedResults.BadRequest(new { message = ex.Message });
        }

        return TypedResults.Created($"/api/exam/{examId}", new { id = examId });
    }

    [HttpPost("extract-writing-visual-data")]
    public async Task<IResult> ExtractWritingVisualData(
        [FromBody] ExtractWritingVisualDataRequestDto dto,
        CancellationToken cancellationToken)
    {
        try
        {
            var result = await writingVisualExtractionService.ExtractAsync(dto, cancellationToken);
            return TypedResults.Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return TypedResults.BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("generate-listening-transcript")]
    public async Task<IResult> GenerateListeningTranscript(
        [FromBody] GenerateListeningTranscriptRequestDto dto,
        CancellationToken cancellationToken)
    {
        try
        {
            var result = await aiIntegrationService.GenerateListeningTranscriptAsync(dto, cancellationToken);
            return TypedResults.Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return TypedResults.BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("generate-speaking-prompt-audio")]
    public async Task<IActionResult> GenerateSpeakingPromptAudio(
        [FromBody] GenerateSpeakingPromptAudioRequestDto dto,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(dto.PromptText))
        {
            return BadRequest(new { message = "PromptText is required." });
        }

        var generatedAudio = await aiIntegrationService.GenerateSpeakingPromptAudioAsync(dto.PromptText, cancellationToken);
        if (generatedAudio is null || generatedAudio.AudioBytes.Length == 0)
        {
            return Problem(
                title: "Failed to generate speaking prompt audio.",
                detail: "AI service did not return any prompt audio.",
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        return File(generatedAudio.AudioBytes, generatedAudio.MimeType);
    }

    [HttpPost("speaking-prompt-audio")]
    [RequestSizeLimit(MaxSpeakingPromptAudioBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxSpeakingPromptAudioBytes)]
    public async Task<IResult> UploadSpeakingPromptAudio(
        [FromForm(Name = "file")] IFormFile? file,
        CancellationToken cancellationToken)
    {
        if (file is null || file.Length == 0)
        {
            return TypedResults.BadRequest(new { message = "Audio file is required." });
        }

        if (file.Length > MaxSpeakingPromptAudioBytes)
        {
            return TypedResults.BadRequest(new { message = "Audio prompt must be 30MB or smaller." });
        }

        var extension = Path.GetExtension(file.FileName);
        if (string.IsNullOrWhiteSpace(extension) || !AllowedSpeakingPromptAudioExtensions.Contains(extension))
        {
            return TypedResults.BadRequest(new { message = "Only audio files are supported: mp3, wav, m4a, webm, ogg, aac, flac." });
        }

        try
        {
            await using var stream = file.OpenReadStream();
            var storedMedia = await speakingMediaStorageService.SavePromptAsync(
                file.FileName,
                stream,
                cancellationToken);

            return TypedResults.Ok(new
            {
                audioUrl = storedMedia.AudioUrl,
                fileSizeKB = storedMedia.FileSizeKB
            });
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to upload speaking prompt audio file {FileName}", file.FileName);
            return TypedResults.Problem(
                title: "Failed to upload speaking prompt audio.",
                detail: "Unexpected server error while storing the audio prompt.",
                statusCode: StatusCodes.Status500InternalServerError);
        }
    }

    [HttpPost("align-listening-transcript")]
    public async Task<IResult> AlignListeningTranscript(
        [FromBody] AlignListeningTranscriptRequestDto dto,
        CancellationToken cancellationToken)
    {
        try
        {
            var result = await aiIntegrationService.AlignListeningTranscriptAsync(dto, cancellationToken);
            return TypedResults.Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return TypedResults.BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("generate-from-pdf")]
    [RequestFormLimits(MultipartBodyLengthLimit = 50 * 1024 * 1024)]
    public async Task<IResult> GenerateExamFromPdf(
        [FromForm(Name = "file")] IFormFile? file,
        [FromHeader(Name = "X-Client-Request-Id")] string? clientRequestId,
        CancellationToken cancellationToken)
    {
        if (!currentUser.TryGetUserId(out var createdBy))
        {
            return TypedResults.Unauthorized();
        }

        var existingActiveJob = pdfGenerationProgressTracker.GetActiveJobByUserId(createdBy);
        if (existingActiveJob is not null)
        {
            return TypedResults.Conflict(new
            {
                message = $"Bạn đang có một tiến trình tạo đề từ PDF đang diễn ra ({existingActiveJob.ProgressPercent}%). Vui lòng đợi hoàn tất hoặc hủy tiến trình trước khi bắt đầu tạo đề mới.",
                activeJob = existingActiveJob
            });
        }

        if (file is null || file.Length == 0)
        {
            return TypedResults.BadRequest(new { message = "PDF file is required." });
        }

        if (!file.FileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase))
        {
            return TypedResults.BadRequest(new { message = "Only PDF files are supported." });
        }

        var uploadId = Guid.NewGuid();
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        pdfGenerationProgressTracker.RegisterCancellationTokenSource(uploadId, clientRequestId, cts);

        try
        {
            if (!string.IsNullOrWhiteSpace(clientRequestId))
            {
                pdfGenerationProgressTracker.Upsert(new PdfGenerationProgressStatusDto(
                    UploadId: uploadId,
                    UploadedBy: createdBy,
                    Status: "processing",
                    ProgressPercent: 1,
                    Stage: "uploading",
                    Message: "Dang upload file va khoi tao tien trinh.",
                    PassageNumber: null,
                    TotalPassages: null,
                    ExamId: null,
                    ClientRequestId: clientRequestId.Trim(),
                    UpdatedAtUtc: DateTime.UtcNow));
            }

            await using var stream = file.OpenReadStream();
            var result = await examPdfGenerationService.GenerateFromPdfAsync(
                stream,
                file.FileName,
                createdBy,
                clientRequestId,
                uploadId,
                cts.Token);

            await PublishExamChangedAsync(cancellationToken);
            return TypedResults.Created(
                $"/api/exam/{result.ExamId}",
                new
                {
                    examId = result.ExamId,
                    uploadId = result.UploadId,
                    passageCount = result.PassageCount,
                    questionCount = result.QuestionCount
                });
        }
        catch (OperationCanceledException)
        {
            logger.LogInformation("Generate exam from PDF was canceled for clientRequestId {ClientRequestId}, uploadId {UploadId}", clientRequestId, uploadId);
            return TypedResults.Ok(new { message = "Tiến trình tạo đề đã được hủy thành công." });
        }
        catch (InvalidOperationException ex)
        {
            logger.LogWarning(ex, "Generate exam from PDF failed with validation error for file {FileName}", file.FileName);
            return TypedResults.BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Generate exam from PDF failed unexpectedly for file {FileName}", file.FileName);
            return TypedResults.Problem(
                title: "Failed to generate exam from uploaded PDF.",
                detail: "Unexpected server error while processing the uploaded PDF.",
                statusCode: StatusCodes.Status500InternalServerError);
        }
        finally
        {
            pdfGenerationProgressTracker.UnregisterCancellationTokenSource(uploadId, clientRequestId);
        }
    }

    [HttpGet("generate-from-pdf/active-job")]
    public IResult GetActivePdfGenerationJob()
    {
        if (!currentUser.TryGetUserId(out var requestedBy))
        {
            return TypedResults.Unauthorized();
        }

        var activeJob = pdfGenerationProgressTracker.GetActiveJobByUserId(requestedBy);
        if (activeJob is null)
        {
            return TypedResults.NotFound(new { message = "Không có tiến trình tạo đề nào đang chạy." });
        }

        return TypedResults.Ok(activeJob);
    }

    [HttpPost("generate-from-pdf/cancel")]
    public async Task<IResult> CancelGenerateExamFromPdf(
        [FromQuery] string? clientRequestId,
        [FromQuery] Guid? uploadId,
        CancellationToken cancellationToken)
    {
        if (!currentUser.TryGetUserId(out var requestedBy))
        {
            return TypedResults.Unauthorized();
        }

        if (string.IsNullOrWhiteSpace(clientRequestId) && !uploadId.HasValue)
        {
            return TypedResults.BadRequest(new { message = "clientRequestId hoặc uploadId là bắt buộc." });
        }

        var canceled = pdfGenerationProgressTracker.TryCancelJob(clientRequestId, uploadId, requestedBy);
        if (!canceled)
        {
            return TypedResults.NotFound(new { message = "Không tìm thấy tiến trình đang chạy hoặc bạn không có quyền hủy." });
        }

        var snapshot = !string.IsNullOrWhiteSpace(clientRequestId)
            ? pdfGenerationProgressTracker.GetByClientRequestId(clientRequestId)
            : uploadId.HasValue ? pdfGenerationProgressTracker.GetByUploadId(uploadId.Value) : null;

        if (snapshot is not null)
        {
            try
            {
                await realtimeDispatcher.PublishAsync(
                    RealtimeEventTypes.ExamPdfGenerationProgress,
                    snapshot,
                    cancellationToken);
            }
            catch (Exception ex)
            {
                logger.LogDebug(ex, "Failed to publish cancellation realtime event");
            }
        }

        return TypedResults.Ok(new { message = "Đã hủy tiến trình tạo đề thành công." });
    }

    [HttpGet("generate-from-pdf/progress")]
    public IResult GetGenerateExamFromPdfProgress(
        [FromQuery] string? clientRequestId,
        [FromQuery] Guid? uploadId)
    {
        if (!currentUser.TryGetUserId(out var requestedBy))
        {
            return TypedResults.Unauthorized();
        }

        if (string.IsNullOrWhiteSpace(clientRequestId) && !uploadId.HasValue)
        {
            return TypedResults.BadRequest(new { message = "clientRequestId or uploadId is required." });
        }

        var snapshot = !string.IsNullOrWhiteSpace(clientRequestId)
            ? pdfGenerationProgressTracker.GetByClientRequestId(clientRequestId)
            : uploadId.HasValue
                ? pdfGenerationProgressTracker.GetByUploadId(uploadId.Value)
                : null;

        if (snapshot is null)
        {
            return TypedResults.NotFound(new { message = "Progress snapshot not found." });
        }

        if (snapshot.UploadedBy != requestedBy)
        {
            return TypedResults.Forbid();
        }

        return TypedResults.Ok(snapshot);
    }

    [HttpPut("{examId}")]
    public async Task<IResult> UpdateExam(
        Guid examId,
        [FromBody] CreateExamDto dto,
        CancellationToken cancellationToken)
    {
        bool updated;
        try
        {
            updated = await examService.UpdateExamAsync(examId, dto, cancellationToken);
        }
        catch (InvalidOperationException ex)
        {
            return TypedResults.BadRequest(new { message = ex.Message });
        }

        if (updated)
        {
            await PublishExamChangedAsync(cancellationToken);
        }
        return updated
            ? TypedResults.Ok(new { message = "Exam updated successfully." })
            : TypedResults.NotFound(new { message = "Exam not found." });
    }

    [HttpDelete("{examId}")]
    public async Task<IResult> Delete(Guid examId, CancellationToken cancellationToken)
    {
        var deleted = await examService.DeleteAsync(examId, cancellationToken);
        if (deleted)
        {
            await PublishExamChangedAsync(cancellationToken);
        }

        return deleted
            ? TypedResults.Ok(new { message = "Exam deleted." })
            : TypedResults.NotFound(new { message = "Exam not found." });
    }

    [HttpPatch("{examId}/publish")]
    public async Task<IResult> UpdateStatus(
        Guid examId,
        [FromBody] UpdateExamStatusRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            var updated = await examService.UpdateStatusAsync(examId, request.IsPublished, cancellationToken);
            if (updated)
            {
                await PublishExamChangedAsync(cancellationToken);
            }
            
            return updated
                ? TypedResults.Ok(new { message = "Status updated successfully." })
                : TypedResults.NotFound(new { message = "Exam not found." });
        }
        catch (InvalidOperationException ex)
        {
            return TypedResults.BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("generate-ai")]
    [RequestFormLimits(MultipartBodyLengthLimit = 50 * 1024 * 1024)]
    public async Task<IResult> GenerateExamAi(
        [FromForm(Name = "file")] IFormFile? file,
        [FromForm(Name = "inputMode")] string inputMode,
        [FromForm(Name = "topicDescription")] string? topicDescription,
        [FromForm(Name = "languageCode")] string? languageCode,
        [FromHeader(Name = "X-Client-Request-Id")] string? clientRequestId,
        CancellationToken cancellationToken)
    {
        if (!currentUser.TryGetUserId(out var createdBy))
        {
            return TypedResults.Unauthorized();
        }

        if (string.IsNullOrWhiteSpace(inputMode))
        {
            return TypedResults.BadRequest(new { message = "inputMode is required." });
        }

        if (inputMode == "document" && (file is null || file.Length == 0))
        {
            return TypedResults.BadRequest(new { message = "File is required for document mode." });
        }

        try
        {
            var uploadId = Guid.NewGuid();
            var fileName = file?.FileName;

            if (!string.IsNullOrWhiteSpace(clientRequestId))
            {
                pdfGenerationProgressTracker.Upsert(new PdfGenerationProgressStatusDto(
                    UploadId: uploadId,
                    UploadedBy: createdBy,
                    Status: "processing",
                    ProgressPercent: 1,
                    Stage: "uploading",
                    Message: "Đang khởi tạo tiến trình sinh đề thi bằng AI.",
                    PassageNumber: null,
                    TotalPassages: null,
                    ExamId: null,
                    ClientRequestId: clientRequestId.Trim(),
                    UpdatedAtUtc: DateTime.UtcNow));
            }

            Stream? stream = null;
            if (file is not null)
            {
                stream = file.OpenReadStream();
            }

            var request = new ExamAiGenerationRequestDto(
                InputMode: inputMode,
                TopicDescription: topicDescription,
                FileUrl: null,
                LanguageCode: languageCode ?? "en"
            );

            var result = await examAiGenerationService.GenerateExamAiAsync(
                stream,
                fileName,
                request,
                createdBy,
                clientRequestId,
                uploadId,
                cancellationToken);

            await PublishExamChangedAsync(cancellationToken);
            return TypedResults.Created(
                $"/api/exam/{result.ExamId}",
                new
                {
                    examId = result.ExamId,
                    uploadId = result.UploadId,
                    passageCount = result.PassageCount,
                    questionCount = result.QuestionCount
                });
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (InvalidOperationException ex)
        {
            logger.LogWarning(ex, "Generate exam from AI failed with validation error.");
            return TypedResults.BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Generate exam from AI failed unexpectedly.");
            return TypedResults.Problem(
                title: "Failed to generate exam using AI.",
                detail: ex.Message,
                statusCode: StatusCodes.Status500InternalServerError);
        }
    }

    private Task PublishExamChangedAsync(CancellationToken cancellationToken) =>
        realtimeDispatcher.PublishAsync(RealtimeEventTypes.ExamsChanged, cancellationToken: cancellationToken);
}

public record UpdateExamStatusRequest(bool IsPublished);
