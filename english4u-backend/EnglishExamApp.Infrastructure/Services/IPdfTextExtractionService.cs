namespace EnglishExamApp.Infrastructure.Services;

public interface IPdfTextExtractionService
{
    Task<PdfTextExtractionResult> ExtractAsync(
        Stream pdfStream,
        string fileName,
        CancellationToken cancellationToken = default);
}
