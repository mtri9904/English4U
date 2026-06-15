using System.Text.Json;

namespace EnglishExamApp.Infrastructure.Services;

internal static class WritingTaskAssetData
{
    public static List<string> ExtractAssetUrls(string? assetsData)
    {
        if (string.IsNullOrWhiteSpace(assetsData))
        {
            return [];
        }

        var trimmed = assetsData.Trim();
        if (!trimmed.StartsWith('{') && !trimmed.StartsWith('['))
        {
            return [trimmed];
        }

        try
        {
            using var document = JsonDocument.Parse(trimmed);
            var urls = new List<string>();
            CollectAssetUrls(document.RootElement, urls);
            return urls
                .Select(url => url.Trim())
                .Where(url => !string.IsNullOrWhiteSpace(url))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
        }
        catch
        {
            return [trimmed];
        }
    }

    public static string? ExtractStructuredData(string? assetsData)
    {
        if (string.IsNullOrWhiteSpace(assetsData))
        {
            return null;
        }

        var trimmed = assetsData.Trim();
        if (!trimmed.StartsWith('{') && !trimmed.StartsWith('['))
        {
            return null;
        }

        try
        {
            using var document = JsonDocument.Parse(trimmed);
            if (document.RootElement.ValueKind != JsonValueKind.Object)
            {
                return null;
            }

            foreach (var propertyName in new[] { "hiddenDataText", "hiddenData", "chartDataText", "chartData", "sourceDataText", "sourceData", "data" })
            {
                if (!document.RootElement.TryGetProperty(propertyName, out var property))
                {
                    continue;
                }

                return property.ValueKind == JsonValueKind.String
                    ? property.GetString()?.Trim()
                    : JsonSerializer.Serialize(property, new JsonSerializerOptions { WriteIndented = true });
            }
        }
        catch
        {
            return null;
        }

        return null;
    }

    public static string InferImageMimeType(string path)
    {
        var extension = Path.GetExtension(path).ToLowerInvariant();
        return extension switch
        {
            ".jpg" or ".jpeg" => "image/jpeg",
            ".webp" => "image/webp",
            ".gif" => "image/gif",
            _ => "image/png"
        };
    }

    private static void CollectAssetUrls(JsonElement element, List<string> urls)
    {
        if (element.ValueKind == JsonValueKind.String)
        {
            var value = element.GetString();
            if (!string.IsNullOrWhiteSpace(value) &&
                (value.StartsWith("http", StringComparison.OrdinalIgnoreCase) || value.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase)))
            {
                urls.Add(value);
            }

            return;
        }

        if (element.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in element.EnumerateArray())
            {
                CollectAssetUrls(item, urls);
            }

            return;
        }

        if (element.ValueKind == JsonValueKind.Object)
        {
            foreach (var property in element.EnumerateObject())
            {
                if (property.Name is "imageUrl" or "url" or "assetUrl" or "src" or "images" or "assets")
                {
                    CollectAssetUrls(property.Value, urls);
                }
            }
        }
    }
}
