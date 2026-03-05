using EnglishExamApp.Application.DTOs.Exams;
using EnglishExamApp.Application.Services;
using Microsoft.AspNetCore.Mvc;

namespace EnglishExamApp.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ExamController(IExamService examService, IGenerateExamService generateExamService) : ControllerBase
{
    [HttpPost("upload-pdf")]
    [RequestSizeLimit(20 * 1024 * 1024)]
    public async Task<IResult> UploadPdf(
        IFormFile file,
        [FromHeader(Name = "X-User-Id")] Guid userId,
        CancellationToken cancellationToken)
    {
        if (file.Length == 0 || !file.FileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase))
            return TypedResults.BadRequest(new { message = "Please upload a valid PDF file." });

        var examId = await generateExamService.ProcessPdfFileAsync(file, userId, cancellationToken);

        return TypedResults.Created($"/api/exam/{examId}", new { examId, message = "Exam generated from PDF successfully." });
    }
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
        var examId = await examService.CreateExamAsync(dto, createdBy, cancellationToken);

        return TypedResults.Created($"/api/exam/{examId}", new { id = examId });
    }

    [HttpPut("{examId}")]
    public async Task<IResult> UpdateExam(
        Guid examId,
        [FromBody] CreateExamDto dto,
        CancellationToken cancellationToken)
    {
        var updated = await examService.UpdateExamAsync(examId, dto, cancellationToken);
        return updated
            ? TypedResults.Ok(new { message = "Exam updated successfully." })
            : TypedResults.NotFound(new { message = "Exam not found." });
    }

    [HttpDelete("{examId}")]
    public async Task<IResult> Delete(Guid examId, CancellationToken cancellationToken)
    {
        var deleted = await examService.DeleteAsync(examId, cancellationToken);

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
        
        return updated
            ? TypedResults.Ok(new { message = "Status updated successfully." })
            : TypedResults.NotFound(new { message = "Exam not found." });
    }
}

public record UpdateExamStatusRequest(bool IsPublished);
