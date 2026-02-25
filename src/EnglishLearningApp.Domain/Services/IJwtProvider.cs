using EnglishLearningApp.Domain.Entities;

namespace EnglishLearningApp.Domain.Services;

public interface IJwtProvider
{
    string GenerateToken(User user);
}
