using EnglishExamApp.Application.DTOs.Ai;

namespace EnglishExamApp.Application.Interfaces;

public interface IAiModelConfigService
{
    string GetModel(string featureKey, string? defaultModel = null);
    IReadOnlyList<string> GetFallbackModels(string featureKey, IReadOnlyList<string>? defaultFallbacks = null);
    IReadOnlyList<string> GetModelCandidates(string featureKey, string? defaultModel = null, IReadOnlyList<string>? defaultFallbacks = null);
    AiFeaturesConfigurationDto GetAllConfigurations();
    Task<AiFeaturesConfigurationDto> UpdateConfigurationsAsync(AiFeaturesConfigurationUpdateDto updateDto, CancellationToken cancellationToken = default);
}

