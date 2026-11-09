namespace EnglishExamApp.Application.DTOs.Ai;

public sealed record GeminiModelDto
{
    public required string Id { get; init; }
    public required string DisplayName { get; init; }
    public string Description { get; init; } = string.Empty;
    public string Category { get; init; } = "Text-out models";
    public int? InputTokenLimit { get; init; }
    public int? OutputTokenLimit { get; init; }
    public long? Rpm { get; init; }
    public long? Tpm { get; init; }
    public long? Rpd { get; init; }
    public bool IsActiveScoring { get; init; }
    public bool IsActiveCopilot { get; init; }
    public IReadOnlyList<string> ActiveFeatures { get; init; } = Array.Empty<string>();
    public IReadOnlyList<string> SupportedGenerationMethods { get; init; } = Array.Empty<string>();
}

public sealed record GeminiModelCatalogRequestDto
{
    public int? Page { get; init; }
    public int? PageSize { get; init; }
    public string? Search { get; init; }
    public string? Category { get; init; }
    public bool? OnlyInUse { get; init; }
    public bool ForceRefresh { get; init; }
}

public sealed record GeminiModelCatalogResponseDto
{
    public required string ProjectId { get; init; }
    public bool HasQuotaAccess { get; init; }
    public string? QuotaMessage { get; init; }
    public string CurrentScoringModel { get; init; } = string.Empty;
    public string CurrentCopilotModel { get; init; } = string.Empty;
    public int Page { get; init; } = 1;
    public int PageSize { get; init; } = 10;
    public int TotalItems { get; init; }
    public int TotalPages { get; init; }
    public IReadOnlyList<GeminiModelDto> Models { get; init; } = Array.Empty<GeminiModelDto>();
    public IReadOnlyList<GeminiModelDto> AllModels { get; init; } = Array.Empty<GeminiModelDto>();
}

