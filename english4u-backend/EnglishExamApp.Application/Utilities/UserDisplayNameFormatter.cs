namespace EnglishExamApp.Application.Utilities;

public static class UserDisplayNameFormatter
{
    public static string FromDisplayNameOrEmail(string? displayName, string email)
    {
        return string.IsNullOrWhiteSpace(displayName)
            ? FromEmail(email)
            : displayName;
    }

    public static string FromEmail(string email)
    {
        if (string.IsNullOrWhiteSpace(email))
        {
            return "user";
        }

        var atIndex = email.IndexOf('@');
        return atIndex > 0 ? email[..atIndex] : email;
    }
}
