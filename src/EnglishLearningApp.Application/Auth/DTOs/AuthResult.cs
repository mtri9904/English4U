namespace EnglishLearningApp.Application.Auth.DTOs;

public record AuthResult(
    Guid UserId,
    string Email,
    string? DisplayName,
    string? Role,
    string Token
);
