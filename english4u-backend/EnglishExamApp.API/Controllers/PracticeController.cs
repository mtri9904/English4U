using EnglishExamApp.Application.DTOs.ExamExecution;
using EnglishExamApp.Application.Services;
using Microsoft.AspNetCore.Mvc;

namespace EnglishExamApp.API.Controllers;

[ApiController]
[Route("api/practice")]
public class PracticeController(
    IExamService examService,
    IExamExecutionService examExecutionService) : ControllerBase
{
    private static bool TryParseUserId(string? rawUserId, out Guid userId) =>
        Guid.TryParse(rawUserId, out userId);

    [HttpGet("exams")]
    public async Task<IResult> GetPublishedExams(CancellationToken cancellationToken)
    {
        var exams = await examService.GetPublishedPracticeExamsAsync(cancellationToken);
        return TypedResults.Ok(exams);
    }

    [HttpGet("exams/{examId:guid}")]
    public async Task<IResult> GetPublishedExamDetail(Guid examId, CancellationToken cancellationToken)
    {
        var exam = await examService.GetPublishedPracticeExamDetailAsync(examId, cancellationToken);

        return exam is null
            ? TypedResults.NotFound(new { message = "Practice exam not found." })
            : TypedResults.Ok(exam);
    }

    [HttpPost("exams/{examId:guid}/start")]
    public async Task<IResult> StartPracticeExam(
        Guid examId,
        [FromQuery] bool forceNew,
        [FromHeader(Name = "X-User-Id")] string? userIdStr,
        CancellationToken cancellationToken)
    {
        if (!TryParseUserId(userIdStr, out var userId))
        {
            return TypedResults.Unauthorized();
        }

        try
        {
            var session = await examExecutionService.StartPracticeSessionAsync(userId, examId, forceNew, cancellationToken);
            return TypedResults.Ok(session);
        }
        catch (InvalidOperationException ex)
        {
            return TypedResults.BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet("my-exams")]
    public async Task<IResult> GetMyPracticeSessions(
        [FromHeader(Name = "X-User-Id")] string? userIdStr,
        CancellationToken cancellationToken)
    {
        if (!TryParseUserId(userIdStr, out var userId))
        {
            return TypedResults.Unauthorized();
        }

        var sessions = await examExecutionService.GetPracticeSessionsAsync(userId, cancellationToken);
        return TypedResults.Ok(sessions);
    }

    [HttpGet("sessions/{sessionId:guid}")]
    public async Task<IResult> GetPracticeSession(
        Guid sessionId,
        [FromHeader(Name = "X-User-Id")] string? userIdStr,
        CancellationToken cancellationToken)
    {
        if (!TryParseUserId(userIdStr, out var userId))
        {
            return TypedResults.Unauthorized();
        }

        var session = await examExecutionService.GetPracticeSessionAsync(userId, sessionId, cancellationToken);
        return session is null
            ? TypedResults.NotFound(new { message = "Practice session not found." })
            : TypedResults.Ok(session);
    }

    [HttpPatch("sessions/{sessionId:guid}/answers")]
    public async Task<IResult> UpdatePracticeSessionAnswers(
        Guid sessionId,
        [FromHeader(Name = "X-User-Id")] string? userIdStr,
        [FromBody] UpdatePracticeSessionAnswersDto dto,
        CancellationToken cancellationToken)
    {
        if (!TryParseUserId(userIdStr, out var userId))
        {
            return TypedResults.Unauthorized();
        }

        try
        {
            await examExecutionService.UpdatePracticeSessionAnswersAsync(userId, sessionId, dto, cancellationToken);
            return TypedResults.Ok(new { message = "Answers saved." });
        }
        catch (InvalidOperationException ex)
        {
            return TypedResults.BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("sessions/{sessionId:guid}/speaking-recordings")]
    [RequestFormLimits(MultipartBodyLengthLimit = 25 * 1024 * 1024)]
    public async Task<IResult> UploadSpeakingRecording(
        Guid sessionId,
        [FromHeader(Name = "X-User-Id")] string? userIdStr,
        [FromForm] Guid speakingQuestionId,
        [FromForm] string? answerText,
        [FromForm] double? durationSeconds,
        [FromForm(Name = "audio")] IFormFile? audio,
        CancellationToken cancellationToken)
    {
        if (!TryParseUserId(userIdStr, out var userId))
        {
            return TypedResults.Unauthorized();
        }

        if (audio is null || audio.Length == 0)
        {
            return TypedResults.BadRequest(new { message = "Audio file is required." });
        }

        try
        {
            await using var stream = audio.OpenReadStream();
            var result = await examExecutionService.UploadSpeakingRecordingAsync(
                userId,
                sessionId,
                new UploadPracticeSpeakingRecordingDto(
                    speakingQuestionId,
                    answerText,
                    durationSeconds),
                stream,
                audio.FileName,
                cancellationToken);
            return TypedResults.Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return TypedResults.BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("sessions/{sessionId:guid}/submit-reading-listening")]
    public async Task<IResult> SubmitReadingListening(
        Guid sessionId,
        [FromHeader(Name = "X-User-Id")] string? userIdStr,
        CancellationToken cancellationToken)
    {
        if (!TryParseUserId(userIdStr, out var userId))
        {
            return TypedResults.Unauthorized();
        }

        try
        {
            var result = await examExecutionService.SubmitReadingListeningAsync(userId, sessionId, cancellationToken);
            return TypedResults.Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return TypedResults.BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("sessions/{sessionId:guid}/submit-writing")]
    public async Task<IResult> SubmitWriting(
        Guid sessionId,
        [FromHeader(Name = "X-User-Id")] string? userIdStr,
        CancellationToken cancellationToken)
    {
        if (!TryParseUserId(userIdStr, out var userId))
        {
            return TypedResults.Unauthorized();
        }

        try
        {
            var result = await examExecutionService.SubmitWritingAsync(userId, sessionId, cancellationToken);
            return TypedResults.Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return TypedResults.BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("sessions/{sessionId:guid}/submit-speaking")]
    public async Task<IResult> SubmitSpeaking(
        Guid sessionId,
        [FromHeader(Name = "X-User-Id")] string? userIdStr,
        CancellationToken cancellationToken)
    {
        if (!TryParseUserId(userIdStr, out var userId))
        {
            return TypedResults.Unauthorized();
        }

        try
        {
            var result = await examExecutionService.SubmitSpeakingAsync(userId, sessionId, cancellationToken);
            return TypedResults.Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return TypedResults.BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("sessions/{sessionId:guid}/rescore-speaking")]
    public async Task<IResult> RescoreSpeaking(
        Guid sessionId,
        [FromHeader(Name = "X-User-Id")] string? userIdStr,
        CancellationToken cancellationToken)
    {
        if (!TryParseUserId(userIdStr, out var userId))
        {
            return TypedResults.Unauthorized();
        }

        try
        {
            var result = await examExecutionService.RescoreSpeakingAsync(userId, sessionId, cancellationToken);
            return TypedResults.Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return TypedResults.BadRequest(new { message = ex.Message });
        }
    }
}
