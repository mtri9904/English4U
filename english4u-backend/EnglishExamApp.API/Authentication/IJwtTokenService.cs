namespace EnglishExamApp.API.Authentication;

public interface IJwtTokenService
{
    string GenerateToken(Guid userId, string email, string role);
    string GenerateRefreshToken();
}
