namespace EnglishExamApp.Application.DTOs.Exams;

public sealed record PdfRawReviewDto(
    string FileName,
    string ExtractionEngine,
    int PageCount,
    int RawTextLength,
    string RawText,
    PdfRawReviewStructureDto Structure,
    List<PdfRawReviewPassageDto> Passages,
    PdfRawReviewAnswerSectionDto? SolutionSection,
    PdfRawReviewExplanationSectionDto? ReviewSection,
    List<PdfRawReviewRequestTraceDto> RequestTrace);

public sealed record PdfRawReviewStructureDto(
    List<PdfRawReviewPassageSeedDto> Passages,
    string SolutionSectionRaw,
    string ReviewSectionRaw);

public sealed record PdfRawReviewPassageSeedDto(
    int PassageNumber,
    string Title,
    string QuestionRange,
    string RawText);

public sealed record PdfRawReviewPassageDto(
    int PassageNumber,
    string Title,
    string QuestionRange,
    string RawText,
    List<PdfRawQuestionInstructionPreviewDto> QuestionGroups);

public sealed record PdfRawReviewAnswerSectionDto(
    string RawText,
    List<PdfRawReviewAnswerItemDto> Answers);

public sealed record PdfRawReviewAnswerItemDto(
    int QuestionNumber,
    string Answer);

public sealed record PdfRawReviewExplanationSectionDto(
    string RawText,
    List<PdfRawReviewExplanationItemDto> Explanations);

public sealed record PdfRawReviewExplanationItemDto(
    int QuestionNumber,
    string Answer,
    string Explanation);

public sealed record PdfRawReviewRequestTraceDto(
    string StepName,
    int InputLength,
    int OutputLength,
    string Status,
    string Notes);
