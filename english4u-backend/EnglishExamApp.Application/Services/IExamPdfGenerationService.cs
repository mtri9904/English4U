using EnglishExamApp.Application.DTOs.Exams;

namespace EnglishExamApp.Application.Services;

public interface IExamPdfGenerationService
{
    Task<GenerateExamFromPdfResultDto> GenerateFromPdfAsync(
        Stream pdfStream,
        string fileName,
        Guid uploadedBy,
        string? clientRequestId = null,
        Guid? uploadId = null,
        CancellationToken cancellationToken = default);

    Task<PdfRawExtractionPreviewDto> PreviewPdfExtractionAsync(
        Stream pdfStream,
        string fileName,
        CancellationToken cancellationToken = default);

    Task<PdfQuestionGroupPreviewDto> PreviewPdfQuestionGroupsAsync(
        Stream pdfStream,
        string fileName,
        CancellationToken cancellationToken = default);

    Task<PdfRawReviewDto> ReviewPdfRawAsync(
        Stream pdfStream,
        string fileName,
        CancellationToken cancellationToken = default);
}
