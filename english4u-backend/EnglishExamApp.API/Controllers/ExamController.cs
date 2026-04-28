using EnglishExamApp.API.Realtime;
using EnglishExamApp.Application.DTOs.Exams;
using EnglishExamApp.Application.Interfaces;
using EnglishExamApp.Application.Services;
using Microsoft.AspNetCore.Mvc;

namespace EnglishExamApp.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ExamController(
    IExamService examService,
    IExamPdfGenerationService examPdfGenerationService,
    IAiIntegrationService aiIntegrationService,
    ISpeakingMediaStorageService speakingMediaStorageService,
    IWritingVisualExtractionService writingVisualExtractionService,
    IPdfGenerationProgressTracker pdfGenerationProgressTracker,
    IRealtimeEventDispatcher realtimeDispatcher,
    ILogger<ExamController> logger) : ControllerBase
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
    public async Task<IResult> GetAll(CancellationToken cancellationToken)
    {
        var exams = await examService.GetAllAsync(cancellationToken);
        return TypedResults.Ok(exams);
    }

    [HttpGet("{examId}")]
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
        [FromHeader(Name = "X-User-Id")] Guid createdBy,
        CancellationToken cancellationToken)
    {
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
        [FromHeader(Name = "X-User-Id")] Guid createdBy,
        [FromHeader(Name = "X-Client-Request-Id")] string? clientRequestId,
        CancellationToken cancellationToken)
    {
        if (createdBy == Guid.Empty)
        {
            return TypedResults.Unauthorized();
        }

        if (file is null || file.Length == 0)
        {
            return TypedResults.BadRequest(new { message = "PDF file is required." });
        }

        if (!file.FileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase))
        {
            return TypedResults.BadRequest(new { message = "Only PDF files are supported." });
        }

        try
        {
            await using var stream = file.OpenReadStream();
            var result = await examPdfGenerationService.GenerateFromPdfAsync(
                stream,
                file.FileName,
                createdBy,
                clientRequestId,
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
    }

    [HttpPost("preview-pdf-raw")]
    [RequestFormLimits(MultipartBodyLengthLimit = 50 * 1024 * 1024)]
    public async Task<IResult> PreviewPdfRawExtraction(
        [FromForm(Name = "file")] IFormFile? file,
        CancellationToken cancellationToken)
    {
        if (file is null || file.Length == 0)
        {
            return TypedResults.BadRequest(new { message = "PDF file is required." });
        }

        if (!file.FileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase))
        {
            return TypedResults.BadRequest(new { message = "Only PDF files are supported." });
        }

        try
        {
            await using var stream = file.OpenReadStream();
            var preview = await examPdfGenerationService.PreviewPdfExtractionAsync(
                stream,
                file.FileName,
                cancellationToken);

            return TypedResults.Ok(preview);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (InvalidOperationException ex)
        {
            logger.LogWarning(ex, "Preview PDF raw extraction failed with validation error for file {FileName}", file.FileName);
            return TypedResults.BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Preview PDF raw extraction failed unexpectedly for file {FileName}", file.FileName);
            return TypedResults.Problem(
                title: "Failed to preview PDF extraction.",
                detail: "Unexpected server error while reading the uploaded PDF.",
                statusCode: StatusCodes.Status500InternalServerError);
        }
    }

    [HttpPost("preview-pdf-question-groups")]
    [RequestFormLimits(MultipartBodyLengthLimit = 50 * 1024 * 1024)]
    public async Task<IResult> PreviewPdfQuestionGroups(
        [FromForm(Name = "file")] IFormFile? file,
        CancellationToken cancellationToken)
    {
        if (file is null || file.Length == 0)
        {
            return TypedResults.BadRequest(new { message = "PDF file is required." });
        }

        if (!file.FileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase))
        {
            return TypedResults.BadRequest(new { message = "Only PDF files are supported." });
        }

        try
        {
            await using var stream = file.OpenReadStream();
            var preview = await examPdfGenerationService.PreviewPdfQuestionGroupsAsync(
                stream,
                file.FileName,
                cancellationToken);

            return TypedResults.Ok(preview);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (InvalidOperationException ex)
        {
            logger.LogWarning(ex, "Preview PDF question groups failed with validation error for file {FileName}", file.FileName);
            return TypedResults.BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Preview PDF question groups failed unexpectedly for file {FileName}", file.FileName);
            return TypedResults.Problem(
                title: "Failed to preview PDF question groups.",
                detail: "Unexpected server error while reading the uploaded PDF.",
                statusCode: StatusCodes.Status500InternalServerError);
        }
    }

    [HttpPost("review-pdf-raw")]
    [RequestFormLimits(MultipartBodyLengthLimit = 50 * 1024 * 1024)]
    public async Task<IResult> ReviewPdfRaw(
        [FromForm(Name = "file")] IFormFile? file,
        CancellationToken cancellationToken)
    {
        if (file is null || file.Length == 0)
        {
            return TypedResults.BadRequest(new { message = "PDF file is required." });
        }

        if (!file.FileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase))
        {
            return TypedResults.BadRequest(new { message = "Only PDF files are supported." });
        }

        try
        {
            await using var stream = file.OpenReadStream();
            var review = await examPdfGenerationService.ReviewPdfRawAsync(
                stream,
                file.FileName,
                cancellationToken);

            return TypedResults.Ok(review);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (InvalidOperationException ex)
        {
            logger.LogWarning(ex, "Review PDF raw failed with validation error for file {FileName}", file.FileName);
            return TypedResults.BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Review PDF raw failed unexpectedly for file {FileName}", file.FileName);
            return TypedResults.Problem(
                title: "Failed to review raw PDF text.",
                detail: "Unexpected server error while reading or analyzing the uploaded PDF.",
                statusCode: StatusCodes.Status500InternalServerError);
        }
    }

    [HttpGet("generate-from-pdf/progress")]
    public IResult GetGenerateExamFromPdfProgress(
        [FromQuery] string? clientRequestId,
        [FromQuery] Guid? uploadId,
        [FromHeader(Name = "X-User-Id")] Guid requestedBy)
    {
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

        if (requestedBy != Guid.Empty && snapshot.UploadedBy != requestedBy)
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
        var updated = await examService.UpdateStatusAsync(examId, request.IsPublished, cancellationToken);
        if (updated)
        {
            await PublishExamChangedAsync(cancellationToken);
        }
        
        return updated
            ? TypedResults.Ok(new { message = "Status updated successfully." })
            : TypedResults.NotFound(new { message = "Exam not found." });
    }

    private Task PublishExamChangedAsync(CancellationToken cancellationToken) =>
        realtimeDispatcher.PublishAsync(RealtimeEventTypes.ExamsChanged, cancellationToken: cancellationToken);
}

public record UpdateExamStatusRequest(bool IsPublished);
