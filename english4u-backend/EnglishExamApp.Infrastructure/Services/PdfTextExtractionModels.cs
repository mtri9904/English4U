namespace EnglishExamApp.Infrastructure.Services;

public sealed record PdfTextExtractionResult(
    string RawText,
    int PageCount,
    string Engine,
    IReadOnlyList<PdfExtractedPage> Pages,
    byte[] PdfBytes,
    string? PrimaryRawText = null,
    string? BackupRawText = null);

public sealed record PdfExtractedPage(
    int PageNumber,
    string RawText,
    double PageHeight,
    IReadOnlyList<PdfExtractedWord> Words,
    IReadOnlyList<PdfExtractedPageImage> Images);

public sealed record PdfExtractedWord(
    string Text,
    double TopFromPageTop,
    double BottomFromPageTop,
    double Left,
    double Right);

public sealed record PdfExtractedPageImage(
    string DataUrl,
    double PageCoverage,
    int PixelArea,
    int WidthInSamples,
    int HeightInSamples,
    double TopFromPageTop,
    double BottomFromPageTop,
    double Left,
    double Right);
