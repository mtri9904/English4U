namespace EnglishExamApp.Application.DTOs.Exams;

public sealed record ExtractWritingVisualDataRequestDto(
    string ImageUrl,
    string? PromptText);

public sealed record ExtractWritingVisualDataResponseDto(
    string HiddenDataText,
    string Model);
