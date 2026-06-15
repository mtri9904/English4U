namespace EnglishExamApp.Application.DTOs.Exams;

public sealed record PdfQuestionGroupPreviewDto(
    string FileName,
    int PassageCount,
    List<PdfRawQuestionInstructionPreviewDto> QuestionGroups);

public sealed record PdfRawExtractionPreviewDto(
    string FileName,
    int RawTextLength,
    string RawText,
    int AnswerZoneLength,
    string AnswerZone,
    int AnswerKeyEntryCount,
    IReadOnlyDictionary<int, string> AnswerKeyEntries,
    List<PdfRawQuestionInstructionPreviewDto> QuestionGroupInstructions,
    List<PdfRawPassagePreviewDto> Passages);

public sealed record PdfRawQuestionInstructionPreviewDto(
    int PassageNumber,
    int StartQuestion,
    int EndQuestion,
    string Tags,
    string? GroupType,
    string Instruction,
    string? QuestionPreview,
    string? TypeEvidence,
    IReadOnlyList<PdfRawVisualPreviewItemDto>? VisualPreviewItems = null,
    string? VisualPreviewNote = null,
    string? DiagramPreviewImageDataUrl = null,
    int? DiagramPreviewPageNumber = null,
    string? DiagramPreviewNote = null);

public sealed record PdfRawVisualPreviewItemDto(
    string ImageDataUrl,
    int PageNumber,
    string? Note = null,
    PdfVisualCropBoxDto? CropBox = null);

public sealed record PdfVisualCropBoxDto(
    double X,
    double Y,
    double Width,
    double Height);

public sealed record PdfRawPassagePreviewDto(
    int PassageNumber,
    int OriginalLength,
    int PreparedLength,
    string OriginalText,
    string PreparedText,
    List<PdfRawQuestionSegmentPreviewDto> QuestionSegments);

public sealed record PdfRawQuestionSegmentPreviewDto(
    int SegmentIndex,
    int? StartQuestion,
    int? EndQuestion,
    int SegmentTextLength,
    string SegmentText);
