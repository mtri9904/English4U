namespace EnglishExamApp.API.Authentication;

public interface IAuthCodeGenerator
{
    string GenerateOtpCode();

    string GeneratePasswordResetToken();
}
