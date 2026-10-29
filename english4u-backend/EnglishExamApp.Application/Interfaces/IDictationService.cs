using EnglishExamApp.Application.DTOs.Dictation;

namespace EnglishExamApp.Application.Interfaces;

public interface IDictationService
{
    Task<DictationExerciseDto> GenerateExerciseAsync(
        DictationGenerateRequestDto request,
        CancellationToken cancellationToken = default);
}

