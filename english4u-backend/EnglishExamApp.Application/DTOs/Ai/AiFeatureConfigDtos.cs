namespace EnglishExamApp.Application.DTOs.Ai;

public sealed record AiFeatureConfigDto
{
    public required string Key { get; init; }
    public required string Name { get; init; }
    public required string Description { get; init; }
    public required string PrimaryModel { get; init; }
    public IReadOnlyList<string> FallbackModels { get; init; } = Array.Empty<string>();
    public string DefaultPrimaryModel { get; init; } = string.Empty;
}

public sealed record AiFeaturesConfigurationDto
{
    public IReadOnlyList<AiFeatureConfigDto> Features { get; init; } = Array.Empty<AiFeatureConfigDto>();
    public DateTime? LastUpdatedAt { get; init; }
}

public sealed record AiFeatureUpdateItemDto
{
    public required string Key { get; init; }
    public required string PrimaryModel { get; init; }
    public List<string>? FallbackModels { get; init; }
}

public sealed record AiFeaturesConfigurationUpdateDto
{
    public required List<AiFeatureUpdateItemDto> Features { get; init; }
}

