using System.Security.Cryptography;

namespace EnglishExamApp.API.Authentication;

public sealed class SecureAuthCodeGenerator : IAuthCodeGenerator
{
    public string GenerateOtpCode() =>
        RandomNumberGenerator.GetInt32(1000, 10_000).ToString("D4");

    public string GeneratePasswordResetToken() =>
        Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
}
