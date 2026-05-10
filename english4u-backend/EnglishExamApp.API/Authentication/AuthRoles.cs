namespace EnglishExamApp.API.Authentication;

internal static class AuthRoles
{
    public const string Admin = "Admin";
    public const string Student = "Student";
    public const string Teacher = "Teacher";
    public const string ContentCreator = "ContentCreator";

    public static IReadOnlyList<string> SeedRoles { get; } =
    [
        Admin,
        Student,
        Teacher,
        ContentCreator
    ];
}
