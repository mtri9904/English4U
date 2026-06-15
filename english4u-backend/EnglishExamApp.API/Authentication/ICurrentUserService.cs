namespace EnglishExamApp.API.Authentication;

public interface ICurrentUserService
{
    Guid? UserId { get; }
    string? Role { get; }
    bool IsAuthenticated { get; }
    bool TryGetUserId(out Guid userId);
}
