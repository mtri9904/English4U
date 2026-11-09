using System.Net.Http.Headers;
using System.Text.Json;
using EnglishExamApp.Application.DTOs.Ai;
using EnglishExamApp.Application.Interfaces;
using Google.Apis.Auth.OAuth2;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace EnglishExamApp.Infrastructure.Services;

public sealed class GeminiCatalogService : IGeminiCatalogService
{
    private const string GenerativeLanguageBaseUrl = "https://generativelanguage.googleapis.com/v1beta";
    private const string CloudQuotasBaseUrl = "https://cloudquotas.googleapis.com/v1";
    private const string CatalogCacheKey = "gemini_model_catalog_full_cache";
    private static readonly TimeSpan CacheDuration = TimeSpan.FromMinutes(5);

    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<GeminiCatalogService> _logger;
    private readonly IMemoryCache _cache;
    private readonly IAiModelConfigService? _aiModelConfigService;

    public GeminiCatalogService(
        HttpClient httpClient,
        IConfiguration configuration,
        ILogger<GeminiCatalogService> logger,
        IMemoryCache cache,
        IAiModelConfigService? aiModelConfigService = null)
    {
        _httpClient = httpClient;
        _configuration = configuration;
        _logger = logger;
        _cache = cache;
        _aiModelConfigService = aiModelConfigService;
    }

    public async Task<GeminiModelCatalogResponseDto> GetModelCatalogAsync(
        GeminiModelCatalogRequestDto? request = null,
        CancellationToken cancellationToken = default)
    {
        GeminiModelCatalogResponseDto fullCatalog;

        var forceRefresh = request?.ForceRefresh ?? false;
        if (!forceRefresh && _cache.TryGetValue(CatalogCacheKey, out GeminiModelCatalogResponseDto? cached) && cached != null)
        {
            fullCatalog = cached;
        }
        else
        {
            fullCatalog = await FetchFullCatalogFromGoogleAsync(cancellationToken);
            _cache.Set(CatalogCacheKey, fullCatalog, CacheDuration);
        }

        // Apply Server-side filtering
        var filtered = fullCatalog.Models.AsEnumerable();

        if (!string.IsNullOrWhiteSpace(request?.Category) && !string.Equals(request.Category, "all", StringComparison.OrdinalIgnoreCase))
        {
            filtered = filtered.Where(m => string.Equals(m.Category, request.Category, StringComparison.OrdinalIgnoreCase));
        }

        if (request?.OnlyInUse == true)
        {
            filtered = filtered.Where(m => m.ActiveFeatures.Count > 0);
        }

        if (!string.IsNullOrWhiteSpace(request?.Search))
        {
            var q = request.Search.Trim().ToLowerInvariant();
            filtered = filtered.Where(m => m.Id.ToLowerInvariant().Contains(q) ||
                                           m.DisplayName.ToLowerInvariant().Contains(q) ||
                                           m.Description.ToLowerInvariant().Contains(q));
        }

        var filteredList = filtered.ToList();
        var totalItems = filteredList.Count;

        var page = request?.Page ?? 1;
        var pageSize = request?.PageSize ?? 10;
        if (page < 1) page = 1;
        if (pageSize < 1) pageSize = 10;

        var totalPages = (int)Math.Ceiling(totalItems / (double)pageSize);
        var pagedModels = filteredList.Skip((page - 1) * pageSize).Take(pageSize).ToList();

        return fullCatalog with
        {
            Page = page,
            PageSize = pageSize,
            TotalItems = totalItems,
            TotalPages = totalPages,
            Models = pagedModels,
            AllModels = fullCatalog.Models
        };
    }

    private async Task<GeminiModelCatalogResponseDto> FetchFullCatalogFromGoogleAsync(CancellationToken cancellationToken)
    {
        var apiKey = GeminiConfiguration.ResolveApiKey(_configuration, "Gemini:ApiKey");
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw new InvalidOperationException(
                GeminiConfiguration.BuildMissingApiKeyMessage("Gemini Catalog", "Gemini:ApiKey"));
        }

        var activeScoringModel = _aiModelConfigService?.GetModel("ai_scoring")
            ?? _configuration["GeminiScoring:Model"]?.Trim()
            ?? string.Empty;

        var activeCopilotModel = _aiModelConfigService?.GetModel("reading_copilot")
            ?? _configuration["GeminiCopilot:Model"]?.Trim()
            ?? string.Empty;

        var allFeatures = _aiModelConfigService?.GetAllConfigurations().Features
            ?? Array.Empty<AiFeatureConfigDto>();

        // 1. Fetch available models from Google AI Studio / Generative Language API
        var models = await FetchGenerativeModelsAsync(apiKey, activeScoringModel, activeCopilotModel, cancellationToken);

        // 2. Fetch Quotas (RPM, TPM, RPD) from Google Cloud Quotas API if Service Account is configured
        var (hasQuotaAccess, quotaMessage, projectId, quotaMap) = await FetchCloudQuotasAsync(cancellationToken);

        // 3. Merge Quotas into Models directly from Google Cloud Quotas API response
        var mergedModels = models.Select(m =>
        {
            var normalizedId = NormalizeModelId(m.Id);
            TryGetModelQuota(quotaMap, normalizedId, "RPM", out var rpm);
            TryGetModelQuota(quotaMap, normalizedId, "TPM", out var tpm);
            TryGetModelQuota(quotaMap, normalizedId, "RPD", out var rpd);

            // Strictly use what Google Quotas API actually returned (including -1 if Google returned unlimited).
            // No hardcoded guessing or fabricated values.
            var finalRpm = rpm != 0 ? (long?)rpm : m.Rpm;
            var finalTpm = tpm != 0 ? (long?)tpm : m.Tpm;
            var finalRpd = rpd != 0 ? (long?)rpd : m.Rpd;

            var activeFeatures = allFeatures
                .Where(f => string.Equals(NormalizeModelId(f.PrimaryModel), normalizedId, StringComparison.OrdinalIgnoreCase))
                .Select(f => f.Key)
                .ToList();

            return m with
            {
                Rpm = finalRpm,
                Tpm = finalTpm,
                Rpd = finalRpd,
                ActiveFeatures = activeFeatures
            };
        }).ToList();

        // 4. Filter out models with null or zero RPM, TPM, RPD (keep only models with actual usable quota on Google Cloud)
        if (hasQuotaAccess && quotaMap.Count > 0)
        {
            mergedModels = mergedModels
                .Where(HasUsableQuota)
                .ToList();
        }

        return new GeminiModelCatalogResponseDto
        {
            ProjectId = projectId,
            HasQuotaAccess = hasQuotaAccess,
            QuotaMessage = quotaMessage,
            CurrentScoringModel = activeScoringModel,
            CurrentCopilotModel = activeCopilotModel,
            TotalItems = mergedModels.Count,
            TotalPages = (int)Math.Ceiling(mergedModels.Count / 10.0),
            Models = mergedModels,
            AllModels = mergedModels
        };
    }

    private async Task<List<GeminiModelDto>> FetchGenerativeModelsAsync(
        string apiKey,
        string activeScoringModel,
        string activeCopilotModel,
        CancellationToken cancellationToken)
    {
        var list = new List<GeminiModelDto>();
        string? pageToken = null;

        // Fetch ALL pages of models from Google Generative Language API (no model left behind due to default page truncation)
        do
        {
            var url = $"{GenerativeLanguageBaseUrl}/models?pageSize=1000&key={Uri.EscapeDataString(apiKey)}";
            if (!string.IsNullOrEmpty(pageToken))
            {
                url += $"&pageToken={Uri.EscapeDataString(pageToken)}";
            }

            using var response = await _httpClient.GetAsync(url, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                var errorBody = await response.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogError("Failed to fetch models from Generative Language API. Status: {Status}, Error: {Error}",
                    response.StatusCode, errorBody);
                throw new HttpRequestException($"Generative Language API error: {response.StatusCode} - {errorBody}");
            }

            using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);

            if (doc.RootElement.TryGetProperty("models", out var modelsElement) &&
                modelsElement.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in modelsElement.EnumerateArray())
                {
                    var rawName = item.TryGetProperty("name", out var nameProp) ? nameProp.GetString() ?? string.Empty : string.Empty;
                    var modelId = NormalizeModelId(rawName);
                    var displayName = item.TryGetProperty("displayName", out var dispProp) ? dispProp.GetString() ?? modelId : modelId;
                    var description = item.TryGetProperty("description", out var descProp) ? descProp.GetString() ?? string.Empty : string.Empty;

                    int? inputLimit = item.TryGetProperty("inputTokenLimit", out var inProp) && inProp.TryGetInt32(out var inVal) ? inVal : null;
                    int? outputLimit = item.TryGetProperty("outputTokenLimit", out var outProp) && outProp.TryGetInt32(out var outVal) ? outVal : null;

                    var methods = new List<string>();
                    if (item.TryGetProperty("supportedGenerationMethods", out var methProp) && methProp.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var m in methProp.EnumerateArray())
                        {
                            var val = m.GetString();
                            if (!string.IsNullOrEmpty(val)) methods.Add(val);
                        }
                    }

                    // Only include models supporting content generation (standard or bidirectional live streaming)
                    var isGenerateContent = methods.Contains("generateContent", StringComparer.OrdinalIgnoreCase) ||
                                            methods.Contains("bidiGenerateContent", StringComparer.OrdinalIgnoreCase);
                    if (!isGenerateContent && methods.Count > 0)
                    {
                        continue;
                    }

                    var isActiveScoring = string.Equals(modelId, NormalizeModelId(activeScoringModel), StringComparison.OrdinalIgnoreCase);
                    var isActiveCopilot = string.Equals(modelId, NormalizeModelId(activeCopilotModel), StringComparison.OrdinalIgnoreCase);

                    list.Add(new GeminiModelDto
                    {
                        Id = modelId,
                        DisplayName = displayName,
                        Description = description,
                        Category = DetermineModelCategory(modelId, displayName, methods, description),
                        InputTokenLimit = inputLimit,
                        OutputTokenLimit = outputLimit,
                        IsActiveScoring = isActiveScoring,
                        IsActiveCopilot = isActiveCopilot,
                        SupportedGenerationMethods = methods
                    });
                }
            }

            pageToken = doc.RootElement.TryGetProperty("nextPageToken", out var npProp)
                ? npProp.GetString()
                : null;
        } while (!string.IsNullOrEmpty(pageToken));

        return list.OrderByDescending(x => x.IsActiveScoring || x.IsActiveCopilot)
                   .ThenBy(x => x.DisplayName)
                   .ToList();
    }

    private async Task<(bool HasQuotaAccess, string? QuotaMessage, string ProjectId, Dictionary<(string ModelId, string Metric), long> Quotas)> FetchCloudQuotasAsync(
        CancellationToken cancellationToken)
    {
        var quotas = new Dictionary<(string ModelId, string Metric), long>();
        var projectId = _configuration["Gemini:ProjectId"]?.Trim() ?? string.Empty;

        var (jsonContent, resolveError) = await ResolveServiceAccountJsonAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(jsonContent))
        {
            return (false, resolveError ?? "Service account configuration not found.", projectId, quotas);
        }

        try
        {
            // Extract projectId from file/payload if not explicitly set
            if (string.IsNullOrWhiteSpace(projectId))
            {
                using var jsonDoc = JsonDocument.Parse(jsonContent);
                if (jsonDoc.RootElement.TryGetProperty("project_id", out var projProp))
                {
                    projectId = projProp.GetString() ?? string.Empty;
                }
            }

            if (string.IsNullOrWhiteSpace(projectId))
            {
                return (false, "Không xác định được Google Cloud Project ID.", projectId, quotas);
            }

            // Authenticate with Service Account to get Bearer Access Token
#pragma warning disable CS0618 // Type or member is obsolete
            var credential = GoogleCredential.FromJson(jsonContent)
                .CreateScoped("https://www.googleapis.com/auth/cloud-platform");
#pragma warning restore CS0618

            var token = await credential.UnderlyingCredential.GetAccessTokenForRequestAsync(cancellationToken: cancellationToken);
            if (string.IsNullOrWhiteSpace(token))
            {
                return (false, "Không thể lấy Access Token từ Service Account.", projectId, quotas);
            }

            // Call Cloud Quotas API with pagination (fetch all quota definitions)
            string? quotaPageToken = null;
            do
            {
                var quotasUrl = $"{CloudQuotasBaseUrl}/projects/{Uri.EscapeDataString(projectId)}/locations/global/services/generativelanguage.googleapis.com/quotaInfos?pageSize=1000";
                if (!string.IsNullOrEmpty(quotaPageToken))
                {
                    quotasUrl += $"&pageToken={Uri.EscapeDataString(quotaPageToken)}";
                }

                using var quotaRequest = new HttpRequestMessage(HttpMethod.Get, quotasUrl);
                quotaRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                using var quotaResponse = await _httpClient.SendAsync(quotaRequest, cancellationToken);
                if (!quotaResponse.IsSuccessStatusCode)
                {
                    var errorBody = await quotaResponse.Content.ReadAsStringAsync(cancellationToken);
                    _logger.LogWarning("Cloud Quotas API returned {StatusCode}: {Error}", quotaResponse.StatusCode, errorBody);

                    var msg = quotaResponse.StatusCode switch
                    {
                        System.Net.HttpStatusCode.Forbidden => "Chưa bật Cloud Quotas API (cloudquotas.googleapis.com) trên Google Cloud Console hoặc Service Account chưa được cấp quyền 'Cloud Quotas Viewer'.",
                        System.Net.HttpStatusCode.NotFound => "Không tìm thấy thông tin Quotas cho project này trên Google Cloud.",
                        _ => $"Google Cloud Quotas API báo lỗi: {(int)quotaResponse.StatusCode} ({quotaResponse.ReasonPhrase})"
                    };

                    return (false, msg, projectId, quotas);
                }

                using var quotaStream = await quotaResponse.Content.ReadAsStreamAsync(cancellationToken);
                using var quotaDoc = await JsonDocument.ParseAsync(quotaStream, cancellationToken: cancellationToken);

                if (quotaDoc.RootElement.TryGetProperty("quotaInfos", out var quotaInfosElement) &&
                    quotaInfosElement.ValueKind == JsonValueKind.Array)
                {
                    foreach (var info in quotaInfosElement.EnumerateArray())
                    {
                        var quotaId = info.TryGetProperty("quotaId", out var qIdProp) ? qIdProp.GetString() ?? string.Empty : string.Empty;

                        // The project is on Free Tier (Free Trial) -> ONLY extract FreeTier quota limits.
                        // Skip all PaidTier limits (PaidTier1, PaidTier2, PaidTier3...) to avoid falsely inheriting paid quotas.
                        if (!quotaId.Contains("FreeTier", StringComparison.OrdinalIgnoreCase))
                        {
                            continue;
                        }

                        var metricType = ResolveMetricType(quotaId);
                        if (metricType == null) continue;

                        if (info.TryGetProperty("dimensionsInfos", out var dimInfos) && dimInfos.ValueKind == JsonValueKind.Array)
                        {
                            foreach (var dimItem in dimInfos.EnumerateArray())
                            {
                                var modelName = string.Empty;
                                if (dimItem.TryGetProperty("dimensions", out var dims) &&
                                    dims.TryGetProperty("model", out var mProp))
                                {
                                    modelName = NormalizeModelId(mProp.GetString() ?? string.Empty);
                                }

                                if (string.IsNullOrWhiteSpace(modelName)) continue;

                                long limitValue = 0;
                                if (dimItem.TryGetProperty("details", out var details))
                                {
                                    if (details.TryGetProperty("isUnlimited", out var unlimProp) && unlimProp.ValueKind == JsonValueKind.True)
                                    {
                                        limitValue = -1;
                                    }
                                    else if (details.TryGetProperty("value", out var vProp))
                                    {
                                        if (vProp.ValueKind == JsonValueKind.Number && vProp.TryGetInt64(out var numVal))
                                        {
                                            limitValue = numVal;
                                        }
                                        else if (vProp.ValueKind == JsonValueKind.String)
                                        {
                                            var strVal = vProp.GetString()?.Trim() ?? string.Empty;
                                            if (string.Equals(strVal, "unlimited", StringComparison.OrdinalIgnoreCase) ||
                                                string.Equals(strVal, "infinity", StringComparison.OrdinalIgnoreCase))
                                            {
                                                limitValue = -1;
                                            }
                                            else if (long.TryParse(strVal, out var parsedVal))
                                            {
                                                limitValue = parsedVal;
                                            }
                                        }
                                    }
                                }

                                quotas[(modelName, metricType)] = limitValue;
                            }
                        }
                    }
                }

                quotaPageToken = quotaDoc.RootElement.TryGetProperty("nextPageToken", out var qnpProp)
                    ? qnpProp.GetString()
                    : null;
            } while (!string.IsNullOrEmpty(quotaPageToken));

            return (true, null, projectId, quotas);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error fetching Google Cloud Quotas.");
            return (false, $"Lỗi khi kết nối Google Cloud Quotas: {ex.Message}", projectId, quotas);
        }
    }

    private async Task<(string? JsonContent, string? ErrorMessage)> ResolveServiceAccountJsonAsync(CancellationToken cancellationToken)
    {
        // 1. Direct JSON string from Configuration or Environment Variables (ideal for Cloud/PaaS/Docker deployment)
        var rawJson = _configuration["Gemini:ServiceAccountJson"]?.Trim();
        if (string.IsNullOrWhiteSpace(rawJson))
        {
            rawJson = Environment.GetEnvironmentVariable("GEMINI_SERVICE_ACCOUNT_JSON")?.Trim() ??
                      Environment.GetEnvironmentVariable("GOOGLE_SERVICE_ACCOUNT_JSON")?.Trim();
        }

        if (!string.IsNullOrWhiteSpace(rawJson))
        {
            return (rawJson, null);
        }

        // 2. Base64-encoded JSON string (avoids multiline / quote escaping issues in deployment dashboards)
        var base64Json = _configuration["Gemini:ServiceAccountJsonBase64"]?.Trim();
        if (string.IsNullOrWhiteSpace(base64Json))
        {
            base64Json = Environment.GetEnvironmentVariable("GEMINI_SERVICE_ACCOUNT_JSON_BASE64")?.Trim() ??
                         Environment.GetEnvironmentVariable("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64")?.Trim();
        }

        if (!string.IsNullOrWhiteSpace(base64Json))
        {
            try
            {
                var bytes = Convert.FromBase64String(base64Json);
                var decodedJson = System.Text.Encoding.UTF8.GetString(bytes);
                return (decodedJson, null);
            }
            catch (Exception ex)
            {
                return (null, $"Error decoding Base64 Service Account JSON: {ex.Message}");
            }
        }

        // 3. Physical file on disk (supports both .json and .b64 files)
        var keyPath = ResolveServiceAccountPath();
        if (!string.IsNullOrWhiteSpace(keyPath) && File.Exists(keyPath))
        {
            try
            {
                var fileContent = await File.ReadAllTextAsync(keyPath, cancellationToken);
                if (keyPath.EndsWith(".b64", StringComparison.OrdinalIgnoreCase))
                {
                    var bytes = Convert.FromBase64String(fileContent.Trim());
                    fileContent = System.Text.Encoding.UTF8.GetString(bytes);
                }
                return (fileContent, null);
            }
            catch (Exception ex)
            {
                return (null, $"Cannot read Service Account file at {keyPath}: {ex.Message}");
            }
        }

        return (null, "Service Account credentials not configured. Please supply 'google-service-account.json' file or environment variable 'Gemini__ServiceAccountJson' / 'Gemini__ServiceAccountJsonBase64'.");
    }

    private string? ResolveServiceAccountPath()
    {
        var configPath = _configuration["Gemini:ServiceAccountKeyPath"]?.Trim();
        var candidates = new List<string>();

        void AddCandidate(string? path)
        {
            if (string.IsNullOrWhiteSpace(path)) return;
            candidates.Add(path);
            if (!Path.IsPathRooted(path))
            {
                candidates.Add(Path.Combine(AppContext.BaseDirectory, path));
                candidates.Add(Path.Combine(Directory.GetCurrentDirectory(), path));
                candidates.Add(Path.Combine(Directory.GetCurrentDirectory(), "EnglishExamApp.API", path));
                candidates.Add(Path.Combine(Directory.GetCurrentDirectory(), "..", "EnglishExamApp.API", path));
                candidates.Add(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "EnglishExamApp.API", path));
                candidates.Add(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "EnglishExamApp.API", path));
            }
        }

        AddCandidate(configPath);
        AddCandidate("google-service-account.json");
        AddCandidate("google-service-account.b64");
        AddCandidate(Environment.GetEnvironmentVariable("GOOGLE_APPLICATION_CREDENTIALS"));

        return candidates.FirstOrDefault(File.Exists);
    }

    private static string NormalizeModelId(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return string.Empty;
        var trimmed = raw.Trim();
        return trimmed.StartsWith("models/", StringComparison.OrdinalIgnoreCase)
            ? trimmed[7..]
            : trimmed;
    }

    private static string? ResolveMetricType(string quotaId)
    {
        if (quotaId.Contains("Tokens", StringComparison.OrdinalIgnoreCase) &&
            quotaId.Contains("Minute", StringComparison.OrdinalIgnoreCase))
        {
            return "TPM";
        }

        if (quotaId.Contains("Minute", StringComparison.OrdinalIgnoreCase) &&
            (quotaId.Contains("Request", StringComparison.OrdinalIgnoreCase) || quotaId.Contains("Session", StringComparison.OrdinalIgnoreCase)))
        {
            return "RPM";
        }

        if (quotaId.Contains("Day", StringComparison.OrdinalIgnoreCase) &&
            (quotaId.Contains("Request", StringComparison.OrdinalIgnoreCase) || quotaId.Contains("PerDay", StringComparison.OrdinalIgnoreCase)))
        {
            return "RPD";
        }

        return null;
    }

    private static readonly HashSet<string> IgnoredModelSuffixTokens = new(StringComparer.OrdinalIgnoreCase)
    {
        "preview", "latest", "it", "exp", "experimental", "1p", "freebie", "customtools"
    };

    private static List<string> TokenizeModelId(string id)
    {
        return id.ToLowerInvariant()
                 .Split(new[] { '-', '.', '_' }, StringSplitOptions.RemoveEmptyEntries)
                 .ToList();
    }

    private static bool TryGetModelQuota(
        Dictionary<(string ModelId, string Metric), long> quotaMap,
        string modelId,
        string metric,
        out long value)
    {
        // 1. Exact match for model name returned by Google Cloud Quotas (including explicit 0 limits)
        if (quotaMap.TryGetValue((modelId, metric), out value))
        {
            return true;
        }

        // 2. Only when Google has no exact match definition for modelId,
        // search by base model prefix (e.g. gemma-4-31b-it -> base model gemma-4-31b,
        // or gemini-3.5-live-translate-preview -> gemini-3.5-live-translate)
        foreach (var key in quotaMap.Keys)
        {
            if (!string.Equals(key.Metric, metric, StringComparison.OrdinalIgnoreCase))
                continue;

            // Skip Google's internal 1st-party dimensions (such as 1p-freebie, internal)
            if (key.ModelId.Contains("1p-freebie", StringComparison.OrdinalIgnoreCase) ||
                key.ModelId.Contains("internal", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            // Only match when modelId starts with key.ModelId followed by hyphen (e.g. gemma-4-31b-it starts with gemma-4-31b)
            if (modelId.StartsWith(key.ModelId + "-", StringComparison.OrdinalIgnoreCase) ||
                modelId.StartsWith(key.ModelId, StringComparison.OrdinalIgnoreCase))
            {
                value = quotaMap[key];
                return true;
            }
        }

        value = 0;
        return false;
    }

    private static string DetermineModelCategory(
        string modelId,
        string displayName,
        List<string> methods,
        string description)
    {
        // 1. Based on Google supportedGenerationMethods returned directly from API:
        // 'bidiGenerateContent' is Google's official method for Live API (bidirectional streaming audio/dialog)
        if (methods.Contains("bidiGenerateContent", StringComparer.OrdinalIgnoreCase))
        {
            return "Live API";
        }

        // 'embedContent' is Google's official method for Embedding models
        if (methods.Contains("embedContent", StringComparer.OrdinalIgnoreCase) &&
            !methods.Contains("generateContent", StringComparer.OrdinalIgnoreCase))
        {
            return "Embedding models";
        }

        // 2. Based on metadata and standard category classification matching Google AI Studio:
        if (modelId.Contains("robotics", StringComparison.OrdinalIgnoreCase))
        {
            return "Other models";
        }

        // Multimodal generation models (TTS generates Audio, Imagen generates images):
        if (modelId.Contains("tts", StringComparison.OrdinalIgnoreCase) ||
            modelId.StartsWith("imagen", StringComparison.OrdinalIgnoreCase) ||
            modelId.Contains("audio", StringComparison.OrdinalIgnoreCase))
        {
            return "Multi-modal generative models";
        }

        // Text generation models (Text-out models) on Google AI Studio: Gemma, Gemini (including Gemini Pro/Flash/Argon whose output is text)
        if (modelId.StartsWith("gemma-", StringComparison.OrdinalIgnoreCase) ||
            modelId.StartsWith("gemini-", StringComparison.OrdinalIgnoreCase) ||
            modelId.Contains("argon", StringComparison.OrdinalIgnoreCase))
        {
            return "Text-out models";
        }

        return "Other models";
    }

    private static bool IsValidQuotaMetric(long? val) => val.HasValue && (val.Value > 0 || val.Value == -1);

    private static bool HasUsableQuota(GeminiModelDto m)
    {
        // Model must have a usable quota metric (positive number or -1 for Unlimited).
        // If RPM, TPM, or RPD is 0 or all metrics are null, consider the model unavailable for this project.
        var hasPositiveOrUnlimited = IsValidQuotaMetric(m.Rpm) || IsValidQuotaMetric(m.Tpm) || IsValidQuotaMetric(m.Rpd);
        var hasExplicitZero = (m.Rpm.HasValue && m.Rpm.Value == 0) ||
                              (m.Tpm.HasValue && m.Tpm.Value == 0) ||
                              (m.Rpd.HasValue && m.Rpd.Value == 0);

        return hasPositiveOrUnlimited && !hasExplicitZero;
    }
}
