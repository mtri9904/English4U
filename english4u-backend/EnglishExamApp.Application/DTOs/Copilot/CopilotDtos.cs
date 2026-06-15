namespace EnglishExamApp.Application.DTOs.Copilot;

public sealed record CopilotChatContextDto(
    string ReviewTitle,
    string ReviewDocumentText,
    string SkillType,
    string? CurrentLocationLabel = null,
    string? CurrentLocationText = null,
    string? CurrentFocusLabel = null,
    string? CurrentFocusText = null,
    int? FocusedQuestionNumber = null,
    string? SelectedText = null,
    string? SelectedTextLabel = null,
    IReadOnlyList<CopilotContextImageDto>? ContextImages = null);

public sealed record CopilotContextImageDto(
    string Url,
    string? Label = null);

public sealed record CopilotChatMessageDto(
    string Role,
    string Content);

public sealed record CopilotChatRequestDto(
    CopilotChatContextDto Context,
    string UserMessage,
    IReadOnlyList<CopilotChatMessageDto>? ChatHistory);
