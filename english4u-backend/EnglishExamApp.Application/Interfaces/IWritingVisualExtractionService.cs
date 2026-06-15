using EnglishExamApp.Application.DTOs.Exams;

namespace EnglishExamApp.Application.Interfaces;

public interface IWritingVisualExtractionService
{
    Task<ExtractWritingVisualDataResponseDto> ExtractAsync(
        ExtractWritingVisualDataRequestDto request,
        CancellationToken cancellationToken = default);
}
