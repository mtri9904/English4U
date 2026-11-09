using System.Collections.Concurrent;
using System.Text.Json;
using EnglishExamApp.Application.DTOs.Ai;
using EnglishExamApp.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace EnglishExamApp.Infrastructure.Services;

public sealed class AiModelConfigService : IAiModelConfigService
{
    private const string ConfigFileName = "gemini-features-config.json";

    private sealed record FeatureMetadata(
        string Key,
        string Name,
        string Description,
        string ConfigPrimaryPath,
        string? ConfigFallbackPath,
        string DefaultPrimary,
        string[] DefaultFallbacks);

    private static readonly IReadOnlyList<FeatureMetadata> FeatureDefinitions = new[]
    {
        new FeatureMetadata(
            "ai_scoring",
            "Chấm thi IELTS Tự luận (Writing & Speaking)",
            "Đánh giá bài nộp của học viên theo 4 tiêu chí chuẩn IELTS, phân tích lỗi ngữ pháp và từ vựng.",
            "GeminiScoring:Model",
            "GeminiScoring:FallbackModels",
            "gemini-3.1-flash-lite",
            new[] { "gemini-3.5-flash-lite", "gemini-2.5-flash" }),

        new FeatureMetadata(
            "scoring_feedback_translation",
            "Dịch nhận xét chấm thi sang Tiếng Việt",
            "Dịch nhận xét chi tiết và gợi ý cải thiện của giám khảo AI sang tiếng Việt giúp học viên dễ hiểu.",
            "GeminiScoring:FeedbackTranslationModel",
            "GeminiScoring:FeedbackTranslationFallbackModels",
            "gemma-4-31b-it",
            new[] { "gemini-3.1-flash-lite", "gemini-3.5-flash-lite" }),

        new FeatureMetadata(
            "reading_copilot",
            "Trợ lý Reading Copilot",
            "Hỏi đáp trực tiếp trên bài đọc, giải thích đáp án đúng/sai và gợi ý từ vựng theo ngữ cảnh.",
            "GeminiCopilot:Model",
            "GeminiCopilot:FallbackModels",
            "gemini-3.1-flash-lite",
            new[] { "gemini-3.5-flash-lite", "gemini-2.5-flash" }),

        new FeatureMetadata(
            "writing_copilot",
            "Trợ lý Writing Copilot",
            "Gợi ý dàn bài, nâng cấp từ vựng học thuật (lexical resource) và gợi ý sửa câu cho Writing Task 1 & 2.",
            "GeminiCopilot:WritingModel",
            "GeminiCopilot:WritingFallbackModels",
            "gemini-3.1-flash-lite",
            new[] { "gemini-3.5-flash-lite", "gemini-2.5-flash" }),

        new FeatureMetadata(
            "writing_visual_extraction",
            "Trích xuất biểu đồ Writing Task 1 (OCR Multimodal)",
            "Phân tích hình ảnh biểu đồ, đồ thị, sơ đồ để trích xuất số liệu chuẩn phục vụ học viên làm bài.",
            "GeminiVisualExtraction:Model",
            "GeminiVisualExtraction:FallbackModels",
            "gemini-3.1-flash-lite",
            new[] { "gemini-3.5-flash-lite", "gemini-2.5-flash" }),

        new FeatureMetadata(
            "pdf_native_extraction",
            "Trích xuất đề thi từ PDF (Multimodal PDF Parser)",
            "Trích xuất trọn vẹn văn bản, nhóm câu hỏi và hình ảnh minh họa từ tài liệu đề thi PDF.",
            "GeminiPdfNativeExtraction:Model",
            null,
            "gemini-3.1-flash-lite",
            new[] { "gemini-2.5-flash" }),

        new FeatureMetadata(
            "exam_ai_generation",
            "Sinh đề thi IELTS tự động bằng AI",
            "Tự động tạo các bộ đề thi IELTS mới đa dạng chủ đề bám sát cấu trúc đề thi chính thức.",
            "GemmaExamGeneration:Model",
            null,
            "gemma-4-31b-it",
            new[] { "gemini-3.1-flash-lite" }),

        new FeatureMetadata(
            "news_translation",
            "Tra cứu từ vựng & Dịch bài báo (News)",
            "Tra cứu nghĩa tiếng Việt và tạo câu ví dụ ngữ cảnh tự nhiên cho từ vựng bài đọc báo chí The Guardian.",
            "NewsTranslation:Model",
            "NewsTranslation:FallbackModels",
            "gemini-3.1-flash-lite",
            new[] { "gemini-3.5-flash-lite", "gemini-2.5-flash" }),

        new FeatureMetadata(
            "dictation_generation",
            "Sinh bài tập Nghe chép chính tả (Dictation AI)",
            "Tự động tạo bài luyện nghe chép chính tả đa dạng chủ đề, phân tích blind spots và từ vựng trọng tâm.",
            "Dictation:Model",
            "Dictation:FallbackModels",
            "gemini-3.1-flash-lite",
            new[] { "gemini-3.5-flash-lite", "gemini-2.5-flash" }),

        new FeatureMetadata(
            "flashcard_ai_enrichment",
            "Tự động làm giàu Flashcard từ vựng bằng AI",
            "Tự động phân tích phiên âm, định nghĩa song ngữ, collocation và ví dụ khi tạo thẻ từ flashcard.",
            "Flashcard:Model",
            "Flashcard:FallbackModels",
            "gemini-3.1-flash-lite",
            new[] { "gemini-3.5-flash-lite", "gemini-2.5-flash" }),

        new FeatureMetadata(
            "speaking_tts",
            "Giọng phát âm giám khảo IELTS Speaking (Gemini TTS)",
            "Mô hình phát âm câu hỏi thi của Examiner với ngữ điệu chuẩn bản xứ dành cho phòng thi IELTS Speaking.",
            "GeminiSpeakingTts:Model",
            "GeminiSpeakingTts:FallbackModels",
            "gemini-3.1-flash-tts",
            new[] { "gemini-3.8-flash-lite-tts", "gemini-3.8-flash-tts", "gemini-2.5-flash-tts" })
    };

    private sealed class RuntimeState
    {
        public string PrimaryModel { get; set; } = string.Empty;
        public List<string> FallbackModels { get; set; } = new();
    }

    private readonly IConfiguration _configuration;
    private readonly ILogger<AiModelConfigService> _logger;
    private readonly ConcurrentDictionary<string, RuntimeState> _state = new(StringComparer.OrdinalIgnoreCase);
    private DateTime? _lastUpdatedAt;
    private readonly string _storageFilePath;

    public AiModelConfigService(IConfiguration configuration, ILogger<AiModelConfigService> logger)
    {
        _configuration = configuration;
        _logger = logger;
        _storageFilePath = ResolveStorageFilePath();

        Initialize();
    }

    public string GetModel(string featureKey, string? defaultModel = null)
    {
        if (_state.TryGetValue(featureKey, out var state) && !string.IsNullOrWhiteSpace(state.PrimaryModel))
        {
            return state.PrimaryModel;
        }

        return defaultModel ?? ResolveDefaultPrimary(featureKey);
    }

    public IReadOnlyList<string> GetFallbackModels(string featureKey, IReadOnlyList<string>? defaultFallbacks = null)
    {
        if (_state.TryGetValue(featureKey, out var state) && state.FallbackModels.Count > 0)
        {
            return state.FallbackModels;
        }

        return defaultFallbacks ?? ResolveDefaultFallbacks(featureKey);
    }

    public IReadOnlyList<string> GetModelCandidates(string featureKey, string? defaultModel = null, IReadOnlyList<string>? defaultFallbacks = null)
    {
        var primary = GetModel(featureKey, defaultModel);
        var fallbacks = GetFallbackModels(featureKey, defaultFallbacks);

        var list = new List<string> { primary };
        list.AddRange(fallbacks);

        return list.Where(s => !string.IsNullOrWhiteSpace(s))
                   .Distinct(StringComparer.OrdinalIgnoreCase)
                   .ToList();
    }

    public AiFeaturesConfigurationDto GetAllConfigurations()
    {
        var list = new List<AiFeatureConfigDto>();

        foreach (var def in FeatureDefinitions)
        {
            var primary = GetModel(def.Key, def.DefaultPrimary);
            var fallbacks = GetFallbackModels(def.Key, def.DefaultFallbacks);

            list.Add(new AiFeatureConfigDto
            {
                Key = def.Key,
                Name = def.Name,
                Description = def.Description,
                PrimaryModel = primary,
                FallbackModels = fallbacks,
                DefaultPrimaryModel = def.DefaultPrimary
            });
        }

        return new AiFeaturesConfigurationDto
        {
            Features = list,
            LastUpdatedAt = _lastUpdatedAt
        };
    }

    public async Task<AiFeaturesConfigurationDto> UpdateConfigurationsAsync(
        AiFeaturesConfigurationUpdateDto updateDto,
        CancellationToken cancellationToken = default)
    {
        foreach (var item in updateDto.Features)
        {
            if (string.IsNullOrWhiteSpace(item.Key) || string.IsNullOrWhiteSpace(item.PrimaryModel))
                continue;

            var state = _state.GetOrAdd(item.Key, _ => new RuntimeState());
            state.PrimaryModel = item.PrimaryModel.Trim();

            if (item.FallbackModels != null)
            {
                state.FallbackModels = item.FallbackModels
                    .Where(m => !string.IsNullOrWhiteSpace(m) && !string.Equals(m.Trim(), state.PrimaryModel, StringComparison.OrdinalIgnoreCase))
                    .Select(m => m.Trim())
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();
            }
        }

        _lastUpdatedAt = DateTime.UtcNow;

        await PersistToFileAsync(cancellationToken);
        SyncAiServiceEnvIfPossible();

        _logger.LogInformation("Updated AI Model Configurations for {Count} features.", updateDto.Features.Count);

        return GetAllConfigurations();
    }

    private void Initialize()
    {
        // 1. Seed defaults from IConfiguration
        foreach (var def in FeatureDefinitions)
        {
            var primary = _configuration[def.ConfigPrimaryPath]?.Trim();
            if (string.IsNullOrWhiteSpace(primary))
            {
                primary = def.DefaultPrimary;
            }

            var fallbacks = new List<string>();
            if (!string.IsNullOrWhiteSpace(def.ConfigFallbackPath))
            {
                var configuredFallbacks = _configuration.GetSection(def.ConfigFallbackPath)
                    .GetChildren()
                    .Select(c => c.Value?.Trim())
                    .Where(v => !string.IsNullOrWhiteSpace(v))
                    .Select(v => v!)
                    .ToList();

                if (configuredFallbacks.Count > 0)
                {
                    fallbacks = configuredFallbacks;
                }
            }

            if (fallbacks.Count == 0)
            {
                fallbacks = def.DefaultFallbacks.ToList();
            }

            _state[def.Key] = new RuntimeState
            {
                PrimaryModel = primary,
                FallbackModels = fallbacks
            };
        }

        // 2. Override from persistent storage file if exists
        try
        {
            if (File.Exists(_storageFilePath))
            {
                var json = File.ReadAllText(_storageFilePath);
                using var doc = JsonDocument.Parse(json);

                if (doc.RootElement.TryGetProperty("features", out var featuresElement) &&
                    featuresElement.ValueKind == JsonValueKind.Object)
                {
                    foreach (var prop in featuresElement.EnumerateObject())
                    {
                        var key = prop.Name;
                        var primary = prop.Value.TryGetProperty("primary", out var pVal) ? pVal.GetString() : null;
                        var fallbacks = new List<string>();

                        if (prop.Value.TryGetProperty("fallbacks", out var fVal) && fVal.ValueKind == JsonValueKind.Array)
                        {
                            foreach (var fItem in fVal.EnumerateArray())
                            {
                                var m = fItem.GetString();
                                if (!string.IsNullOrWhiteSpace(m)) fallbacks.Add(m.Trim());
                            }
                        }

                        if (!string.IsNullOrWhiteSpace(primary))
                        {
                            _state[key] = new RuntimeState
                            {
                                PrimaryModel = primary.Trim(),
                                FallbackModels = fallbacks
                            };
                        }
                    }
                }

                if (doc.RootElement.TryGetProperty("lastUpdatedAt", out var timeProp) &&
                    timeProp.TryGetDateTime(out var time))
                {
                    _lastUpdatedAt = time;
                }

                _logger.LogInformation("Loaded AI features configuration from {Path}", _storageFilePath);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to load dynamic AI feature configuration from {Path}, using defaults.", _storageFilePath);
        }
    }

    private async Task PersistToFileAsync(CancellationToken cancellationToken)
    {
        try
        {
            var dict = new Dictionary<string, object>();
            var featuresDict = new Dictionary<string, object>();

            foreach (var kvp in _state)
            {
                featuresDict[kvp.Key] = new
                {
                    primary = kvp.Value.PrimaryModel,
                    fallbacks = kvp.Value.FallbackModels
                };
            }

            dict["features"] = featuresDict;
            dict["lastUpdatedAt"] = _lastUpdatedAt ?? DateTime.UtcNow;

            var json = JsonSerializer.Serialize(dict, new JsonSerializerOptions { WriteIndented = true });
            await File.WriteAllTextAsync(_storageFilePath, json, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to persist AI features configuration to {Path}", _storageFilePath);
        }
    }

    private void SyncAiServiceEnvIfPossible()
    {
        try
        {
            var scoringModel = GetModel("ai_scoring");
            var scoringFallbacks = string.Join(",", GetFallbackModels("ai_scoring"));
            var ttsModel = GetModel("speaking_tts");
            var ttsFallbacks = string.Join(",", GetFallbackModels("speaking_tts"));
            var candidates = new[]
            {
                Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "AiScoringService", ".env"),
                Path.Combine(Directory.GetCurrentDirectory(), "..", "AiScoringService", ".env"),
                Path.Combine(Directory.GetCurrentDirectory(), "AiScoringService", ".env")
            };

            var envPath = candidates.FirstOrDefault(File.Exists);
            if (envPath == null) return;

            var lines = File.ReadAllLines(envPath);
            var updated = false;

            for (var i = 0; i < lines.Length; i++)
            {
                if (lines[i].StartsWith("GEMINI_SCORING_MODEL=", StringComparison.OrdinalIgnoreCase))
                {
                    lines[i] = $"GEMINI_SCORING_MODEL={scoringModel}";
                    updated = true;
                }
                else if (lines[i].StartsWith("GEMINI_SCORING_FALLBACK_MODELS=", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(scoringFallbacks))
                {
                    lines[i] = $"GEMINI_SCORING_FALLBACK_MODELS={scoringFallbacks}";
                    updated = true;
                }
                else if (lines[i].StartsWith("GEMINI_SPEAKING_SCORING_MODEL=", StringComparison.OrdinalIgnoreCase))
                {
                    lines[i] = $"GEMINI_SPEAKING_SCORING_MODEL={scoringModel}";
                    updated = true;
                }
                else if (lines[i].StartsWith("GEMINI_SPEAKING_SCORING_FALLBACK_MODELS=", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(scoringFallbacks))
                {
                    lines[i] = $"GEMINI_SPEAKING_SCORING_FALLBACK_MODELS={scoringFallbacks}";
                    updated = true;
                }
                else if (lines[i].StartsWith("GEMINI_SPEAKING_TTS_MODEL=", StringComparison.OrdinalIgnoreCase))
                {
                    lines[i] = $"GEMINI_SPEAKING_TTS_MODEL={ttsModel}";
                    updated = true;
                }
                else if (lines[i].StartsWith("GEMINI_SPEAKING_TTS_FALLBACK_MODELS=", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(ttsFallbacks))
                {
                    lines[i] = $"GEMINI_SPEAKING_TTS_FALLBACK_MODELS={ttsFallbacks}";
                    updated = true;
                }
            }

            if (updated)
            {
                File.WriteAllLines(envPath, lines);
                _logger.LogInformation("Synchronized GEMINI_SCORING_MODEL={Model} to {Path}", scoringModel, envPath);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not synchronize scoring model to AiScoringService .env");
        }
    }

    private string ResolveStorageFilePath()
    {
        var candidates = new[]
        {
            Path.Combine(Directory.GetCurrentDirectory(), "EnglishExamApp.API", ConfigFileName),
            Path.Combine(Directory.GetCurrentDirectory(), ConfigFileName),
            Path.Combine(AppContext.BaseDirectory, ConfigFileName)
        };

        var existing = candidates.FirstOrDefault(File.Exists);
        if (existing != null) return existing;

        var preferredDir = Directory.Exists(Path.Combine(Directory.GetCurrentDirectory(), "EnglishExamApp.API"))
            ? Path.Combine(Directory.GetCurrentDirectory(), "EnglishExamApp.API")
            : Directory.GetCurrentDirectory();

        return Path.Combine(preferredDir, ConfigFileName);
    }

    private static string ResolveDefaultPrimary(string key) =>
        FeatureDefinitions.FirstOrDefault(f => string.Equals(f.Key, key, StringComparison.OrdinalIgnoreCase))?.DefaultPrimary ?? "gemini-3.1-flash-lite";

    private static IReadOnlyList<string> ResolveDefaultFallbacks(string key) =>
        FeatureDefinitions.FirstOrDefault(f => string.Equals(f.Key, key, StringComparison.OrdinalIgnoreCase))?.DefaultFallbacks ?? Array.Empty<string>();
}
