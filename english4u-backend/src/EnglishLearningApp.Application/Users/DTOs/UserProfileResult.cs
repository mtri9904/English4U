namespace EnglishLearningApp.Application.Users.DTOs;

public record UserProfileResult(
    Guid Id,
    string Email,
    string? DisplayName,
    string? Role,
    string? AvatarUrl,
    bool IsActive,
    DateTime CreatedAt
);
