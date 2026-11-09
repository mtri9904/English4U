using EnglishExamApp.Application.DTOs.Ai;

namespace EnglishExamApp.Application.Interfaces;

public interface IGeminiCatalogService
{
    Task<GeminiModelCatalogResponseDto> GetModelCatalogAsync(
        GeminiModelCatalogRequestDto? request = null,
        CancellationToken cancellationToken = default);
}

