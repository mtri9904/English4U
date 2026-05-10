using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace EnglishExamApp.Infrastructure.Data;

public sealed class ApplicationDbContextFactory : IDesignTimeDbContextFactory<ApplicationDbContext>
{
    private const string UserSecretsId = "english4u-backend-api";

    public ApplicationDbContext CreateDbContext(string[] args)
    {
        var connectionString = ResolveConnectionString();
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException(
                "Missing required connection string 'DefaultConnection'. Set it with environment variable 'ConnectionStrings__DefaultConnection' or user-secrets key 'ConnectionStrings:DefaultConnection'.");
        }

        var optionsBuilder = new DbContextOptionsBuilder<ApplicationDbContext>();
        optionsBuilder.UseSqlServer(connectionString);

        return new ApplicationDbContext(optionsBuilder.Options);
    }

    private static string? ResolveConnectionString() =>
        FirstConfigured(
            Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection"),
            Environment.GetEnvironmentVariable("ConnectionStrings:DefaultConnection"),
            ReadUserSecret("ConnectionStrings:DefaultConnection"),
            ReadApiAppSettings("ConnectionStrings", "DefaultConnection"));

    private static string? ReadUserSecret(string key)
    {
        var paths = new[]
        {
            Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "Microsoft",
                "UserSecrets",
                UserSecretsId,
                "secrets.json"),
            Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                ".microsoft",
                "usersecrets",
                UserSecretsId,
                "secrets.json")
        };

        foreach (var path in paths)
        {
            var value =
                ReadJsonString(path, key)
                ?? ReadJsonString(path, key.Split(':'));
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value;
            }
        }

        return null;
    }

    private static string? ReadApiAppSettings(params string[] keyPath)
    {
        foreach (var apiDirectory in GetApiDirectoryCandidates())
        {
            var value = FirstConfigured(
                ReadJsonString(Path.Combine(apiDirectory, "appsettings.Development.json"), keyPath),
                ReadJsonString(Path.Combine(apiDirectory, "appsettings.json"), keyPath));

            if (!string.IsNullOrWhiteSpace(value))
            {
                return value;
            }
        }

        return null;
    }

    private static IEnumerable<string> GetApiDirectoryCandidates()
    {
        var currentDirectory = new DirectoryInfo(Directory.GetCurrentDirectory());
        while (currentDirectory is not null)
        {
            yield return Path.Combine(currentDirectory.FullName, "EnglishExamApp.API");

            if (string.Equals(currentDirectory.Name, "EnglishExamApp.Infrastructure", StringComparison.OrdinalIgnoreCase)
                && currentDirectory.Parent is not null)
            {
                yield return Path.Combine(currentDirectory.Parent.FullName, "EnglishExamApp.API");
            }

            currentDirectory = currentDirectory.Parent;
        }
    }

    private static string? ReadJsonString(string path, params string[] keyPath)
    {
        if (!File.Exists(path))
        {
            return null;
        }

        using var document = JsonDocument.Parse(File.ReadAllText(path));
        var element = document.RootElement;
        foreach (var key in keyPath)
        {
            if (!TryGetProperty(element, key, out element))
            {
                return null;
            }
        }

        return element.ValueKind == JsonValueKind.String
            ? element.GetString()
            : null;
    }

    private static bool TryGetProperty(JsonElement element, string key, out JsonElement value)
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            foreach (var property in element.EnumerateObject())
            {
                if (string.Equals(property.Name, key, StringComparison.OrdinalIgnoreCase))
                {
                    value = property.Value;
                    return true;
                }
            }
        }

        value = default;
        return false;
    }

    private static string? FirstConfigured(params string?[] values) =>
        values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value));
}
