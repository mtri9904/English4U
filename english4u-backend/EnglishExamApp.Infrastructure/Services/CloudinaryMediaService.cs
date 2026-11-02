using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using EnglishExamApp.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace EnglishExamApp.Infrastructure.Services;

public class CloudinaryMediaService(
    IConfiguration configuration,
    IHttpClientFactory httpClientFactory,
    IHostEnvironment hostEnvironment,
    ILogger<CloudinaryMediaService> logger) : ICloudinaryMediaService
{
    private static readonly HashSet<string> AudioExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".mp3", ".wav", ".ogg", ".m4a", ".webm", ".aac", ".flac", ".mp4"
    };

    private static readonly Regex VersionRegex = new(@"^v\d+$", RegexOptions.Compiled);

    private (string? cloudName, string? apiKey, string? apiSecret) GetCredentials(string account)
    {
        var sectionName = account.Equals("feedback", StringComparison.OrdinalIgnoreCase)
            ? "CloudinaryFeedback"
            : "CloudinaryMain";

        var cloudName = configuration[$"{sectionName}:CloudName"];
        var apiKey = configuration[$"{sectionName}:ApiKey"];
        var apiSecret = configuration[$"{sectionName}:ApiSecret"];

        return (cloudName, apiKey, apiSecret);
    }

    public async Task<string?> UploadAsync(
        Stream fileStream,
        string fileName,
        string folder,
        string account = "main",
        string resourceType = "auto",
        CancellationToken cancellationToken = default)
    {
        var (cloudName, apiKey, apiSecret) = GetCredentials(account);
        if (string.IsNullOrWhiteSpace(cloudName) || string.IsNullOrWhiteSpace(apiKey) || string.IsNullOrWhiteSpace(apiSecret))
        {
            logger.LogWarning("Cloudinary credentials missing for account '{Account}'.", account);
            return null;
        }

        var validResourceType = string.IsNullOrWhiteSpace(resourceType) ? "auto" : resourceType.Trim().ToLowerInvariant();
        if (validResourceType is not ("image" or "video" or "raw" or "auto"))
        {
            validResourceType = "auto";
        }

        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString(CultureInfo.InvariantCulture);
        var toSign = $"folder={folder}&timestamp={timestamp}{apiSecret}";

        using var sha1 = SHA1.Create();
        var signature = Convert.ToHexString(sha1.ComputeHash(Encoding.UTF8.GetBytes(toSign))).ToLowerInvariant();

        using var formContent = new MultipartFormDataContent();
        using var streamContent = new StreamContent(fileStream);
        var ext = Path.GetExtension(fileName).ToLowerInvariant();
        var mime = ext switch
        {
            ".png" => "image/png",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".webp" => "image/webp",
            ".gif" => "image/gif",
            ".svg" => "image/svg+xml",
            ".mp3" => "audio/mpeg",
            ".wav" => "audio/wav",
            ".m4a" => "audio/mp4",
            ".webm" => "audio/webm",
            ".pdf" => "application/pdf",
            _ => "application/octet-stream"
        };
        streamContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(mime);
        formContent.Add(streamContent, "file", fileName);
        formContent.Add(new StringContent(apiKey), "api_key");
        formContent.Add(new StringContent(timestamp), "timestamp");
        formContent.Add(new StringContent(folder), "folder");
        formContent.Add(new StringContent(signature), "signature");

        var clientName = account.Equals("feedback", StringComparison.OrdinalIgnoreCase)
            ? "CloudinaryFeedback"
            : "CloudinaryMain";

        var httpClient = httpClientFactory.CreateClient(clientName);
        var response = await httpClient.PostAsync(
            $"https://api.cloudinary.com/v1_1/{cloudName}/{validResourceType}/upload",
            formContent,
            cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            var err = await response.Content.ReadAsStringAsync(cancellationToken);
            logger.LogWarning("Cloudinary upload failed for account {Account}: {Error}", account, err);
            return null;
        }

        using var jsonDoc = await JsonDocument.ParseAsync(
            await response.Content.ReadAsStreamAsync(cancellationToken),
            cancellationToken: cancellationToken);

        if (jsonDoc.RootElement.TryGetProperty("secure_url", out var secureUrlProp))
        {
            return secureUrlProp.GetString();
        }

        return null;
    }

    public async Task<bool> DeleteMediaAsync(
        string? urlOrPublicId,
        string account = "main",
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(urlOrPublicId))
        {
            return false;
        }

        var trimmed = urlOrPublicId.Trim();

        // 1. Handle local server disk file paths
        if (trimmed.Contains("/uploads/", StringComparison.OrdinalIgnoreCase))
        {
            return DeleteLocalFile(trimmed);
        }

        // 2. Parse Cloudinary URL or Public ID
        var parsed = ParseCloudinaryTarget(trimmed, account);
        if (parsed is null)
        {
            return false;
        }

        return await DestroyOnCloudinaryAsync(parsed.Value.cloudName, parsed.Value.apiKey, parsed.Value.apiSecret,
            parsed.Value.publicId, parsed.Value.resourceType, cancellationToken);
    }

    public async Task<int> DeleteMediaListAsync(
        IEnumerable<string?> urlsOrPublicIds,
        string account = "main",
        CancellationToken cancellationToken = default)
    {
        var distinctTargets = urlsOrPublicIds
            .Where(u => !string.IsNullOrWhiteSpace(u))
            .Select(u => u!.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (distinctTargets.Count == 0)
        {
            return 0;
        }

        var deletedCount = 0;
        var parallelOptions = new ParallelOptions
        {
            MaxDegreeOfParallelism = 4,
            CancellationToken = cancellationToken
        };

        await Parallel.ForEachAsync(distinctTargets, parallelOptions, async (target, ct) =>
        {
            try
            {
                var success = await DeleteMediaAsync(target, account, ct);
                if (success)
                {
                    Interlocked.Increment(ref deletedCount);
                }
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to delete target media asset: {Target}", target);
            }
        });

        return deletedCount;
    }

    private bool DeleteLocalFile(string relativeOrAbsoluteUrl)
    {
        try
        {
            var uploadIndex = relativeOrAbsoluteUrl.IndexOf("/uploads/", StringComparison.OrdinalIgnoreCase);
            if (uploadIndex < 0) return false;

            var relativePath = relativeOrAbsoluteUrl[(uploadIndex + 1)..].Replace('/', Path.DirectorySeparatorChar);
            var physicalPath = Path.Combine(hostEnvironment.ContentRootPath, relativePath);

            if (File.Exists(physicalPath))
            {
                File.Delete(physicalPath);
                logger.LogInformation("Deleted local file: {Path}", physicalPath);
                return true;
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to delete local file for {Url}", relativeOrAbsoluteUrl);
        }

        return false;
    }

    private (string cloudName, string apiKey, string apiSecret, string publicId, string resourceType)? ParseCloudinaryTarget(
        string target,
        string preferredAccount)
    {
        var (cloudName, apiKey, apiSecret) = GetCredentials(preferredAccount);

        if (Uri.TryCreate(target, UriKind.Absolute, out var uri) &&
            uri.Host.Contains("cloudinary.com", StringComparison.OrdinalIgnoreCase))
        {
            var segments = uri.AbsolutePath.Trim('/').Split('/', StringSplitOptions.RemoveEmptyEntries);
            if (segments.Length >= 4)
            {
                var urlCloudName = segments[0];
                var urlResourceType = segments[1].ToLowerInvariant(); // image, video, raw

                // Switch account if url specifies another cloud
                var feedbackCloud = configuration["CloudinaryFeedback:CloudName"];
                var mainCloud = configuration["CloudinaryMain:CloudName"];

                if (!string.IsNullOrEmpty(feedbackCloud) && urlCloudName.Equals(feedbackCloud, StringComparison.OrdinalIgnoreCase))
                {
                    (cloudName, apiKey, apiSecret) = GetCredentials("feedback");
                }
                else if (!string.IsNullOrEmpty(mainCloud) && urlCloudName.Equals(mainCloud, StringComparison.OrdinalIgnoreCase))
                {
                    (cloudName, apiKey, apiSecret) = GetCredentials("main");
                }

                // Locate where public_id begins after version or upload
                int versionIndex = -1;
                for (int i = 3; i < segments.Length; i++)
                {
                    if (VersionRegex.IsMatch(segments[i]))
                    {
                        versionIndex = i;
                        break;
                    }
                }

                string[] publicIdSegments;
                if (versionIndex != -1 && versionIndex + 1 < segments.Length)
                {
                    publicIdSegments = segments[(versionIndex + 1)..];
                }
                else
                {
                    int startIndex = 3;
                    while (startIndex < segments.Length - 1 && IsTransformationSegment(segments[startIndex]))
                    {
                        startIndex++;
                    }
                    publicIdSegments = segments[startIndex..];
                }

                var fullPath = Uri.UnescapeDataString(string.Join("/", publicIdSegments));
                var ext = Path.GetExtension(fullPath).ToLowerInvariant();

                // If audio/video extension, force video resourceType
                if (AudioExtensions.Contains(ext))
                {
                    urlResourceType = "video";
                }

                // In Cloudinary, images and videos do not include file extension in public_id, while raw files require it
                var publicId = (urlResourceType is "image" or "video" && !string.IsNullOrEmpty(ext))
                    ? fullPath[..^ext.Length]
                    : fullPath;

                if (string.IsNullOrWhiteSpace(cloudName) || string.IsNullOrWhiteSpace(apiKey) || string.IsNullOrWhiteSpace(apiSecret))
                {
                    logger.LogWarning("Missing Cloudinary credentials for target {Target}", target);
                    return null;
                }

                return (cloudName, apiKey, apiSecret, publicId, urlResourceType);
            }
        }

        // Direct public_id provided
        if (!string.IsNullOrWhiteSpace(cloudName) && !string.IsNullOrWhiteSpace(apiKey) && !string.IsNullOrWhiteSpace(apiSecret))
        {
            var ext = Path.GetExtension(target).ToLowerInvariant();
            var resourceType = AudioExtensions.Contains(ext) ? "video" : "image";
            var publicId = (!string.IsNullOrEmpty(ext)) ? target[..^ext.Length] : target;
            return (cloudName, apiKey, apiSecret, publicId, resourceType);
        }

        return null;
    }

    private static bool IsTransformationSegment(string segment)
    {
        if (segment.Contains(',')) return true;
        string[] prefixes = ["c_", "w_", "h_", "q_", "f_", "e_", "b_", "a_", "r_", "o_", "co_", "l_", "u_", "fl_", "pg_", "dn_", "ar_", "g_"];
        return prefixes.Any(p => segment.StartsWith(p, StringComparison.OrdinalIgnoreCase));
    }

    private async Task<bool> DestroyOnCloudinaryAsync(
        string cloudName,
        string apiKey,
        string apiSecret,
        string publicId,
        string resourceType,
        CancellationToken cancellationToken)
    {
        var candidateIds = new List<string> { publicId };
        var ext = Path.GetExtension(publicId);
        if (!string.IsNullOrEmpty(ext))
        {
            candidateIds.Add(publicId[..^ext.Length]);
        }

        var candidateTypes = new[] { resourceType, "image", "raw", "video" }
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        foreach (var cId in candidateIds.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            foreach (var cType in candidateTypes)
            {
                if (await DestroySingleAttemptAsync(cloudName, apiKey, apiSecret, cId, cType, cancellationToken))
                {
                    return true;
                }
            }
        }

        logger.LogWarning("[CloudinaryDestroy] Could not delete asset '{PublicId}' on cloud '{CloudName}' across all candidates and resource types.", publicId, cloudName);
        return false;
    }

    private async Task<bool> DestroySingleAttemptAsync(
        string cloudName,
        string apiKey,
        string apiSecret,
        string publicId,
        string resourceType,
        CancellationToken cancellationToken)
    {
        try
        {
            var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString(CultureInfo.InvariantCulture);
            var toSign = $"invalidate=true&public_id={publicId}&timestamp={timestamp}{apiSecret}";

            using var sha1 = SHA1.Create();
            var signature = Convert.ToHexString(sha1.ComputeHash(Encoding.UTF8.GetBytes(toSign))).ToLowerInvariant();

            using var formContent = new FormUrlEncodedContent(
            [
                new KeyValuePair<string, string>("public_id", publicId),
                new KeyValuePair<string, string>("api_key", apiKey),
                new KeyValuePair<string, string>("timestamp", timestamp),
                new KeyValuePair<string, string>("invalidate", "true"),
                new KeyValuePair<string, string>("signature", signature)
            ]);

            var httpClient = httpClientFactory.CreateClient("CloudinaryDestroy");
            var response = await httpClient.PostAsync(
                $"https://api.cloudinary.com/v1_1/{cloudName}/{resourceType}/destroy",
                formContent,
                cancellationToken);

            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (response.IsSuccessStatusCode)
            {
                using var jsonDoc = JsonDocument.Parse(body);
                if (jsonDoc.RootElement.TryGetProperty("result", out var resultProp))
                {
                    var result = resultProp.GetString();
                    if (result == "ok")
                    {
                        logger.LogInformation("[CloudinaryDestroy] Success: asset '{PublicId}' ({ResourceType}) deleted on cloud '{CloudName}'.", publicId, resourceType, cloudName);
                        return true;
                    }
                }
            }

            logger.LogWarning("[CloudinaryDestroy] Attempt returned: {Body} for '{PublicId}' ({ResourceType}) on cloud '{CloudName}'", body, publicId, resourceType, cloudName);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "[CloudinaryDestroy] Error attempting delete for '{PublicId}' ({ResourceType}) on cloud '{CloudName}'", publicId, resourceType, cloudName);
        }

        return false;
    }
}
