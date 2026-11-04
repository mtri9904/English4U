using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Xml.Linq;
using EnglishExamApp.Application.DTOs.News;
using EnglishExamApp.Application.Interfaces;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace EnglishExamApp.Infrastructure.Services;

public class TheGuardianNewsService : INewsService
{
    private readonly HttpClient _httpClient;
    private readonly IMemoryCache _cache;
    private readonly IConfiguration _configuration;
    private readonly ILogger<TheGuardianNewsService> _logger;
    private readonly IGemmaCompletionClient _gemmaClient;

    // Daily Request Budget Tracker (Thread-safe)
    private static int _dailyRequestCount = 0;
    private static DateTime _currentDayUtc = DateTime.UtcNow.Date;
    private static readonly object _quotaLock = new();

    private const int MaxSafeDailyLimit = 480;
    private const int MaxOfficialLimit = 500;
    private const int ListCacheDurationMinutes = 25;
    private const int ArticleCacheDurationHours = 24;

    private static readonly Dictionary<string, (string Section, string Label)> CategoryMap = new(StringComparer.OrdinalIgnoreCase)
    {
        ["travel"] = ("travel", "Du lịch & Khám phá"),
        ["culture"] = ("culture", "Văn hóa & Nghệ thuật"),
        ["lifestyle"] = ("lifeandstyle", "Đời sống & Sức khỏe"),
        ["business"] = ("business", "Kinh tế & Thị trường"),
        ["science"] = ("science", "Khoa học & Tự nhiên"),
        ["technology"] = ("technology", "Công nghệ & Tương lai"),
        ["all"] = ("", "Tất cả tin tức"),
    };

    public TheGuardianNewsService(
        HttpClient httpClient,
        IMemoryCache cache,
        IConfiguration configuration,
        ILogger<TheGuardianNewsService> logger,
        IGemmaCompletionClient gemmaClient)
    {
        _httpClient = httpClient;
        _cache = cache;
        _configuration = configuration;
        _logger = logger;
        _gemmaClient = gemmaClient;
    }

    public async Task<NewsListResponseDto> GetNewsListAsync(
        string category = "all",
        int page = 1,
        int pageSize = 20,
        string? search = null,
        bool forceRefresh = false)
    {
        category = string.IsNullOrWhiteSpace(category) ? "all" : category.ToLowerInvariant();
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 5, 200);

        var normalizedCategory = CategoryMap.ContainsKey(category) ? category : "all";
        var (_, categoryLabel) = CategoryMap[normalizedCategory];

        // 1. Check Master RAM Pool (0 requests to The Guardian)
        var poolKey = $"guardian_master_pool_{normalizedCategory}";
        if (!forceRefresh && string.IsNullOrWhiteSpace(search) && _cache.TryGetValue(poolKey, out List<NewsArticleDto>? pool) && pool != null && pool.Count > 0)
        {
            var paged = pool.Skip((page - 1) * pageSize).Take(pageSize).ToList();
            if (paged.Count > 0)
            {
                var quota = GetQuotaStatus();
                return new NewsListResponseDto
                {
                    Items = paged,
                    Category = normalizedCategory,
                    Total = pool.Count,
                    Page = page,
                    PageSize = pageSize,
                    IsCached = true,
                    DailyQuotaUsed = quota.UsedToday,
                    DailyQuotaRemaining = quota.RemainingToday
                };
            }
        }

        var cacheKey = $"guardian_news_list_{normalizedCategory}_{page}_{pageSize}_{search?.Trim().ToLowerInvariant()}";

        if (!forceRefresh && _cache.TryGetValue(cacheKey, out NewsListResponseDto? cachedResponse) && cachedResponse != null)
        {
            var quota = GetQuotaStatus();
            cachedResponse.DailyQuotaUsed = quota.UsedToday;
            cachedResponse.DailyQuotaRemaining = quota.RemainingToday;
            cachedResponse.IsCached = true;
            return cachedResponse;
        }

        // Check if daily quota is available
        if (!CanMakeOutboundRequest())
        {
            _logger.LogWarning("The Guardian daily quota threshold reached ({Count}/{Limit}). Serving fallback/cached response.",
                _dailyRequestCount, MaxSafeDailyLimit);

            // Attempt to serve any stale cache or fallback
            return GetFallbackResponse(normalizedCategory, categoryLabel, page, pageSize);
        }

        try
        {
            var apiKey = GetApiKey();
            var baseUrl = _configuration["TheGuardian:BaseUrl"] ?? "https://content.guardianapis.com";

            var (section, _) = CategoryMap[normalizedCategory];
            var url = $"{baseUrl}/search?api-key={apiKey}&page={page}&page-size={pageSize}&show-fields=headline,standfirst,thumbnail,byline,body&order-by=newest";

            if (!string.IsNullOrWhiteSpace(section))
            {
                url += $"&section={section}";
            }

            if (!string.IsNullOrWhiteSpace(search))
            {
                url += $"&q={Uri.EscapeDataString(search.Trim())}";
            }

            IncrementQuotaCounter();

            var response = await _httpClient.GetAsync(url);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("The Guardian API search error: {StatusCode}. Falling back to official Guardian RSS.", response.StatusCode);
                return await FetchFromGuardianRssAsync(normalizedCategory, categoryLabel, page, pageSize, search);
            }

            var jsonContent = await response.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(jsonContent);

            var root = doc.RootElement;
            if (!root.TryGetProperty("response", out var respElement))
            {
                return await FetchFromGuardianRssAsync(normalizedCategory, categoryLabel, page, pageSize, search);
            }

            var total = respElement.TryGetProperty("total", out var totalEl) ? totalEl.GetInt32() : 0;
            var resultsArray = respElement.TryGetProperty("results", out var resultsEl) && resultsEl.ValueKind == JsonValueKind.Array
                ? resultsEl.EnumerateArray()
                : Enumerable.Empty<JsonElement>();

            var items = new List<NewsArticleDto>();
            foreach (var item in resultsArray)
            {
                var article = ParseArticleFromJson(item, normalizedCategory);
                if (article != null)
                {
                    items.Add(article);
                    // Also seed article detail cache for 24 hours so clicking this article is instant 0-request!
                    if (!string.IsNullOrWhiteSpace(article.BodyHtml))
                    {
                        var articleCacheKey = $"guardian_article_{article.Id}";
                        _cache.Set(articleCacheKey, article, TimeSpan.FromHours(ArticleCacheDurationHours));
                    }
                }
            }

            var quotaStatus = GetQuotaStatus();
            var resultResponse = new NewsListResponseDto
            {
                Items = items,
                Category = normalizedCategory,
                Total = total > 0 ? total : items.Count,
                Page = page,
                PageSize = pageSize,
                IsCached = false,
                DailyQuotaUsed = quotaStatus.UsedToday,
                DailyQuotaRemaining = quotaStatus.RemainingToday
            };

            // Cache the list for 25 minutes
            _cache.Set(cacheKey, resultResponse, TimeSpan.FromMinutes(ListCacheDurationMinutes));

            if (string.IsNullOrWhiteSpace(search) && items.Count > 0 && page == 1)
            {
                _cache.Set(poolKey, items, TimeSpan.FromMinutes(ListCacheDurationMinutes));
            }

            return resultResponse;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to fetch news from The Guardian API");
            return GetFallbackResponse(normalizedCategory, categoryLabel, page, pageSize);
        }
    }

    public async Task<NewsArticleDto?> GetArticleDetailAsync(string articleId)
    {
        if (string.IsNullOrWhiteSpace(articleId))
            return null;

        var normalizedId = articleId.Trim().TrimStart('/');
        var cacheKey = $"guardian_article_{normalizedId}";

        // If in RAM cache, return immediately (0 request!)
        if (_cache.TryGetValue(cacheKey, out NewsArticleDto? cachedArticle) && cachedArticle != null)
        {
            return cachedArticle;
        }

        // Check quota threshold
        if (!CanMakeOutboundRequest())
        {
            _logger.LogWarning("The Guardian daily quota threshold reached when requesting article detail: {ArticleId}", normalizedId);
            return null;
        }

        try
        {
            var apiKey = GetApiKey();
            var baseUrl = _configuration["TheGuardian:BaseUrl"] ?? "https://content.guardianapis.com";
            var url = $"{baseUrl}/{normalizedId}?api-key={apiKey}&show-fields=headline,standfirst,thumbnail,byline,body,main&show-elements=image";

            IncrementQuotaCounter();

            var response = await _httpClient.GetAsync(url);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError("The Guardian API article detail error: {StatusCode} for id {Id}", response.StatusCode, normalizedId);
                return null;
            }

            var jsonContent = await response.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(jsonContent);

            var root = doc.RootElement;
            if (!root.TryGetProperty("response", out var respElement) ||
                !respElement.TryGetProperty("content", out var contentElement))
            {
                return null;
            }

            var category = InferCategory(contentElement.TryGetProperty("sectionId", out var secEl) ? secEl.GetString() : "");
            var article = ParseArticleFromJson(contentElement, category);

            if (article != null)
            {
                // Cache full article HTML for 24 hours
                _cache.Set(cacheKey, article, TimeSpan.FromHours(ArticleCacheDurationHours));
            }

            return article;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to fetch article detail from The Guardian API: {ArticleId}", normalizedId);
            return null;
        }
    }

    public NewsQuotaStatusDto GetQuotaStatus()
    {
        EnsureDayReset();
        lock (_quotaLock)
        {
            return new NewsQuotaStatusDto
            {
                UsedToday = _dailyRequestCount,
                MaxDailyLimit = MaxOfficialLimit,
                SafeDailyLimit = MaxSafeDailyLimit,
                RemainingToday = Math.Max(0, MaxSafeDailyLimit - _dailyRequestCount),
                ResetTimeUtc = _currentDayUtc.AddDays(1)
            };
        }
    }

    private static bool CanMakeOutboundRequest()
    {
        EnsureDayReset();
        return Volatile.Read(ref _dailyRequestCount) < MaxSafeDailyLimit;
    }

    private static void IncrementQuotaCounter()
    {
        EnsureDayReset();
        Interlocked.Increment(ref _dailyRequestCount);
    }

    private static void EnsureDayReset()
    {
        var todayUtc = DateTime.UtcNow.Date;
        if (todayUtc != _currentDayUtc)
        {
            lock (_quotaLock)
            {
                if (todayUtc != _currentDayUtc)
                {
                    _dailyRequestCount = 0;
                    _currentDayUtc = todayUtc;
                }
            }
        }
    }

    private string GetApiKey()
    {
        var key = _configuration["TheGuardian:ApiKey"];
        if (string.IsNullOrWhiteSpace(key))
        {
            throw new InvalidOperationException("The Guardian API Key is required. Please configure 'TheGuardian:ApiKey' in appsettings or as environment variable 'TheGuardian__ApiKey'.");
        }
        return key.Trim();
    }

    private static string InferCategory(string? sectionId)
    {
        if (string.IsNullOrWhiteSpace(sectionId)) return "all";
        sectionId = sectionId.ToLowerInvariant();

        if (sectionId.Contains("travel")) return "travel";
        if (sectionId.Contains("culture") || sectionId.Contains("art") || sectionId.Contains("film") || sectionId.Contains("music") || sectionId.Contains("book")) return "culture";
        if (sectionId.Contains("life") || sectionId.Contains("health") || sectionId.Contains("fashion") || sectionId.Contains("food")) return "lifestyle";
        if (sectionId.Contains("business") || sectionId.Contains("money") || sectionId.Contains("econom")) return "business";
        if (sectionId.Contains("science") || sectionId.Contains("environment")) return "science";
        if (sectionId.Contains("tech")) return "technology";

        return "all";
    }

    private static NewsArticleDto? ParseArticleFromJson(JsonElement element, string category)
    {
        try
        {
            var id = element.TryGetProperty("id", out var idEl) ? idEl.GetString() ?? "" : "";
            var webTitle = element.TryGetProperty("webTitle", out var titleEl) ? titleEl.GetString() ?? "" : "";
            var webUrl = element.TryGetProperty("webUrl", out var urlEl) ? urlEl.GetString() ?? "" : "";
            var pubDateStr = element.TryGetProperty("webPublicationDate", out var dateEl) ? dateEl.GetString() : null;

            var pubDate = DateTime.TryParse(pubDateStr, out var parsedDate) ? parsedDate : DateTime.UtcNow;

            string description = "";
            string? bodyHtml = null;
            string? thumbnail = null;
            string? author = null;
            string? mainImageUrl = null;
            string? mainImageCaption = null;

            if (element.TryGetProperty("fields", out var fieldsEl))
            {
                if (fieldsEl.TryGetProperty("headline", out var headlineEl))
                    webTitle = headlineEl.GetString() ?? webTitle;

                if (fieldsEl.TryGetProperty("standfirst", out var standfirstEl))
                    description = StripHtml(standfirstEl.GetString() ?? "");

                if (fieldsEl.TryGetProperty("thumbnail", out var thumbEl))
                    thumbnail = thumbEl.GetString();

                if (fieldsEl.TryGetProperty("byline", out var bylineEl))
                    author = bylineEl.GetString();

                if (fieldsEl.TryGetProperty("body", out var bodyEl))
                    bodyHtml = bodyEl.GetString();

                if (fieldsEl.TryGetProperty("main", out var mainEl))
                {
                    var mainHtml = mainEl.GetString() ?? "";
                    var matchImg = Regex.Match(mainHtml, "<img[^>]+src=[\"']([^\"'>]+)[\"']", RegexOptions.IgnoreCase);
                    if (matchImg.Success)
                    {
                        mainImageUrl = matchImg.Groups[1].Value;
                    }
                    var matchCaption = Regex.Match(mainHtml, "<figcaption[^>]*>(.*?)</figcaption>", RegexOptions.IgnoreCase | RegexOptions.Singleline);
                    if (matchCaption.Success)
                    {
                        mainImageCaption = StripHtml(matchCaption.Groups[1].Value);
                    }
                }
            }

            if (string.IsNullOrWhiteSpace(description) && !string.IsNullOrWhiteSpace(bodyHtml))
            {
                description = StripHtml(bodyHtml);
                if (description.Length > 220)
                {
                    description = description.Substring(0, 220) + "...";
                }
            }

            if (string.IsNullOrWhiteSpace(thumbnail))
            {
                thumbnail = mainImageUrl;
            }

            var readingTime = CalculateReadingTime(bodyHtml ?? description);
            var (_, label) = CategoryMap.TryGetValue(category, out var meta) ? meta : ("", "Tất cả tin tức");

            return new NewsArticleDto
            {
                Id = id,
                Title = webTitle,
                Description = description,
                BodyHtml = SanitizeArticleBodyHtml(bodyHtml),
                Link = webUrl,
                Author = author,
                PublishDate = pubDate,
                Thumbnail = thumbnail,
                MainImageUrl = mainImageUrl,
                MainImageCaption = mainImageCaption,
                Category = category,
                CategoryLabel = label,
                Source = "The Guardian",
                ReadingTime = readingTime
            };
        }
        catch
        {
            return null;
        }
    }

    private static string SanitizeArticleBodyHtml(string? html)
    {
        if (string.IsNullOrWhiteSpace(html))
            return string.Empty;

        // Remove scripts, styles, iframes for security
        var cleaned = Regex.Replace(html, "<script\\b[^<]*(?:(?!</script>)<[^<]*)*</script>", "", RegexOptions.IgnoreCase);
        cleaned = Regex.Replace(cleaned, "<style\\b[^<]*(?:(?!</style>)<[^<]*)*</style>", "", RegexOptions.IgnoreCase);

        // Ensure all hyperlinks open in new tab with secure rel
        cleaned = Regex.Replace(cleaned, @"<a\b(?![^>]*\btarget=)([^>]*)>", @"<a target=""_blank"" rel=""noopener noreferrer""$1>", RegexOptions.IgnoreCase);

        return cleaned;
    }

    private static string StripHtml(string html)
    {
        if (string.IsNullOrWhiteSpace(html)) return "";
        var text = Regex.Replace(html, "<[^>]*>", " ");
        text = System.Net.WebUtility.HtmlDecode(text);
        return Regex.Replace(text, @"\s+", " ").Trim();
    }

    private static int CalculateReadingTime(string text)
    {
        var cleanText = StripHtml(text);
        var words = cleanText.Split(new[] { ' ', '\r', '\n', '\t' }, StringSplitOptions.RemoveEmptyEntries).Length;
        return Math.Max(1, (int)Math.Ceiling(words / 180.0));
    }

    private static readonly Dictionary<string, string> CategoryDefaultImages = new(StringComparer.OrdinalIgnoreCase)
    {
        ["all"] = "https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=800&q=80",
        ["travel"] = "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=800&q=80",
        ["culture"] = "https://images.unsplash.com/photo-1518998053901-5348d3961a04?auto=format&fit=crop&w=800&q=80",
        ["lifestyle"] = "https://images.unsplash.com/photo-1545205597-3d9d02c29597?auto=format&fit=crop&w=800&q=80",
        ["business"] = "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80",
        ["science"] = "https://images.unsplash.com/photo-1507413245164-6160d8298b31?auto=format&fit=crop&w=800&q=80",
        ["technology"] = "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=800&q=80"
    };

    private static string GetDefaultImageForCategory(string category)
    {
        return CategoryDefaultImages.TryGetValue(category, out var img)
            ? img
            : CategoryDefaultImages["all"];
    }

    private static readonly Dictionary<string, string> CategoryRssMap = new(StringComparer.OrdinalIgnoreCase)
    {
        ["travel"] = "https://www.theguardian.com/uk/travel/rss",
        ["culture"] = "https://www.theguardian.com/culture/rss",
        ["lifestyle"] = "https://www.theguardian.com/lifeandstyle/rss",
        ["business"] = "https://www.theguardian.com/business/rss",
        ["science"] = "https://www.theguardian.com/science/rss",
        ["technology"] = "https://www.theguardian.com/technology/rss",
        ["all"] = "https://www.theguardian.com/world/rss"
    };

    private async Task<NewsListResponseDto> FetchFromGuardianRssAsync(
        string category,
        string categoryLabel,
        int page,
        int pageSize,
        string? search)
    {
        var rssUrl = CategoryRssMap.TryGetValue(category, out var url)
            ? url
            : CategoryRssMap["all"];

        try
        {
            var xmlString = await _httpClient.GetStringAsync(rssUrl);
            var xDoc = XDocument.Parse(xmlString);
            XNamespace mediaNs = "http://search.yahoo.com/mrss/";
            XNamespace dcNs = "http://purl.org/dc/elements/1.1/";

            var items = new List<NewsArticleDto>();
            var channel = xDoc.Root?.Element("channel");
            if (channel == null)
            {
                return GetFallbackResponse(category, categoryLabel, page, pageSize);
            }

            foreach (var itemElem in channel.Elements("item"))
            {
                var title = itemElem.Element("title")?.Value ?? "";
                var link = itemElem.Element("link")?.Value ?? "";
                var rawDesc = itemElem.Element("description")?.Value ?? "";
                var pubDateStr = itemElem.Element("pubDate")?.Value ?? "";
                var creator = itemElem.Element(dcNs + "creator")?.Value ?? "The Guardian Staff";

                // Media image - grab highest quality media:content
                var mediaElements = itemElem.Elements(mediaNs + "content").ToList();
                var bestMedia = mediaElements.LastOrDefault();
                var imageUrl = bestMedia?.Attribute("url")?.Value ?? GetDefaultImageForCategory(category);
                var caption = bestMedia?.Element(mediaNs + "credit")?.Value ?? "";

                DateTime pubDate = DateTime.TryParse(pubDateStr, out var parsedDate) ? parsedDate : DateTime.UtcNow;

                var cleanDesc = StripHtml(rawDesc);
                if (cleanDesc.EndsWith("Continue reading..."))
                {
                    cleanDesc = cleanDesc.Substring(0, cleanDesc.Length - "Continue reading...".Length).Trim();
                }

                if (!string.IsNullOrWhiteSpace(search))
                {
                    var q = search.Trim();
                    if (!title.Contains(q, StringComparison.OrdinalIgnoreCase) &&
                        !cleanDesc.Contains(q, StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }
                }

                var id = !string.IsNullOrWhiteSpace(link)
                    ? link.Replace("https://www.theguardian.com/", "")
                    : Guid.NewGuid().ToString("N");

                var article = new NewsArticleDto
                {
                    Id = id,
                    Title = title,
                    Description = cleanDesc,
                    BodyHtml = SanitizeArticleBodyHtml(rawDesc),
                    Link = link,
                    Author = creator,
                    PublishDate = pubDate,
                    Thumbnail = imageUrl,
                    MainImageUrl = imageUrl,
                    MainImageCaption = caption,
                    Category = category,
                    CategoryLabel = categoryLabel,
                    Source = "The Guardian",
                    ReadingTime = CalculateReadingTime(cleanDesc)
                };

                items.Add(article);

                // Cache individual article for 24 hours
                var articleCacheKey = $"guardian_article_{article.Id}";
                _cache.Set(articleCacheKey, article, TimeSpan.FromHours(ArticleCacheDurationHours));
            }

            var pagedItems = items.Skip((page - 1) * pageSize).Take(pageSize).ToList();
            var quota = GetQuotaStatus();

            var response = new NewsListResponseDto
            {
                Items = pagedItems,
                Category = category,
                Total = items.Count,
                Page = page,
                PageSize = pageSize,
                IsCached = false,
                DailyQuotaUsed = quota.UsedToday,
                DailyQuotaRemaining = quota.RemainingToday
            };

            var cacheKey = $"guardian_news_list_{category}_{page}_{pageSize}_{search?.Trim().ToLowerInvariant()}";
            _cache.Set(cacheKey, response, TimeSpan.FromMinutes(ListCacheDurationMinutes));

            return response;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to parse The Guardian RSS feed from {Url}", rssUrl);
            return GetFallbackResponse(category, categoryLabel, page, pageSize);
        }
    }

    private NewsListResponseDto GetFallbackResponse(string category, string label, int page, int pageSize)
    {
        var quota = GetQuotaStatus();
        return new NewsListResponseDto
        {
            Items = new List<NewsArticleDto>(),
            Category = category,
            Total = 0,
            Page = page,
            PageSize = pageSize,
            IsCached = true,
            DailyQuotaUsed = quota.UsedToday,
            DailyQuotaRemaining = quota.RemainingToday
        };
    }

    public async Task<NewsTranslateResponseDto> TranslateParagraphAsync(
        NewsTranslateRequestDto request,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request?.Text))
        {
            return new NewsTranslateResponseDto { TranslatedText = string.Empty };
        }

        var cleanText = request.Text.Trim();
        var textHash = Convert.ToHexString(System.Security.Cryptography.MD5.HashData(System.Text.Encoding.UTF8.GetBytes(cleanText)));
        var cacheKey = !string.IsNullOrWhiteSpace(request.ArticleId) && request.ParagraphIndex.HasValue
            ? $"news_trans_{request.ArticleId}_{request.ParagraphIndex.Value}"
            : $"news_trans_{textHash}";

        // 1. Check RAM Cache (7-day validity, 0ms response)
        if (_cache.TryGetValue(cacheKey, out string? cachedTranslation) && !string.IsNullOrWhiteSpace(cachedTranslation))
        {
            return new NewsTranslateResponseDto
            {
                TranslatedText = cachedTranslation,
                IsCached = true,
                ModelUsed = "cache"
            };
        }

        // 2. Translate with Gemma AI (models: gemma-4-26b-a4b-it, gemma-4-31b-it)
        var modelsToTry = new[] { "gemma-4-26b-a4b-it", "gemma-4-31b-it" };
        var prompt = $"Translate the following news paragraph from The Guardian into natural, accurate, and fluent Vietnamese.\n\n" +
                     $"CRITICAL REQUIREMENTS:\n" +
                     $"1. Respond with ONLY a valid JSON object in this exact schema:\n" +
                     $"{{\"translation\": \"<Bản dịch tiếng Việt tự nhiên và chuẩn xác tại đây>\"}}\n" +
                     $"2. Output ONLY the JSON object. Do NOT wrap in markdown code blocks. Do NOT output any thought tags (<thought>, <think>), reasoning, explanations, drafts, or English analysis.\n" +
                     $"3. The translation field must contain ONLY the Vietnamese translated text.\n\n" +
                     $"Paragraph to translate:\n{cleanText}";

        foreach (var model in modelsToTry)
        {
            try
            {
                var translated = await _gemmaClient.CompleteWithModelAsync(prompt, model, cancellationToken);
                if (!string.IsNullOrWhiteSpace(translated))
                {
                    var cleanResult = CleanTranslationResult(translated);
                    if (!string.IsNullOrWhiteSpace(cleanResult))
                    {
                        // Store in 7-day RAM cache
                        _cache.Set(cacheKey, cleanResult, TimeSpan.FromDays(7));
                        return new NewsTranslateResponseDto
                        {
                            TranslatedText = cleanResult,
                            IsCached = false,
                            ModelUsed = model
                        };
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Model {Model} failed to translate paragraph. Trying next fallback model...", model);
            }
        }

        return new NewsTranslateResponseDto
        {
            TranslatedText = cleanText,
            IsCached = false,
            ModelUsed = "failed"
        };
    }

    public async Task<NewsDictionaryDto?> LookupWordAsync(string word, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(word)) return null;

        // Clean punctuation, quotes and whitespace surrounding the word
        var cleanWord = Regex.Replace(word.Trim(), @"^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$", string.Empty).ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(cleanWord)) return null;

        var cacheKey = $"dict_{cleanWord}";

        // 1. Check RAM Cache (30-day retention)
        if (_cache.TryGetValue(cacheKey, out NewsDictionaryDto? cached) && cached != null)
        {
            return cached;
        }

        var result = new NewsDictionaryDto
        {
            Word = cleanWord
        };

        // 2. Query public Free Dictionary API
        try
        {
            var dictUrl = $"https://api.dictionaryapi.dev/api/v2/entries/en/{Uri.EscapeDataString(cleanWord)}";
            using var dictCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            dictCts.CancelAfter(TimeSpan.FromSeconds(3));

            var response = await _httpClient.GetAsync(dictUrl, dictCts.Token);
            if (response.IsSuccessStatusCode)
            {
                var json = await response.Content.ReadAsStringAsync(cancellationToken);
                using var doc = JsonDocument.Parse(json);
                if (doc.RootElement.ValueKind == JsonValueKind.Array && doc.RootElement.GetArrayLength() > 0)
                {
                    var firstEntry = doc.RootElement[0];
                    if (firstEntry.TryGetProperty("phonetic", out var phEl) && !string.IsNullOrWhiteSpace(phEl.GetString()))
                    {
                        result.Phonetic = phEl.GetString();
                    }

                    if (firstEntry.TryGetProperty("phonetics", out var phoneticsEl) && phoneticsEl.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var p in phoneticsEl.EnumerateArray())
                        {
                            if (string.IsNullOrWhiteSpace(result.Phonetic) && p.TryGetProperty("text", out var tEl) && !string.IsNullOrWhiteSpace(tEl.GetString()))
                            {
                                result.Phonetic = tEl.GetString();
                            }
                            if (string.IsNullOrWhiteSpace(result.AudioUrl) && p.TryGetProperty("audio", out var aEl) && !string.IsNullOrWhiteSpace(aEl.GetString()))
                            {
                                var audio = aEl.GetString()!;
                                if (audio.StartsWith("//"))
                                {
                                    audio = "https:" + audio;
                                }
                                result.AudioUrl = audio;
                            }
                        }
                    }

                    if (firstEntry.TryGetProperty("meanings", out var meaningsEl) && meaningsEl.ValueKind == JsonValueKind.Array && meaningsEl.GetArrayLength() > 0)
                    {
                        foreach (var meaning in meaningsEl.EnumerateArray())
                        {
                            if (string.IsNullOrWhiteSpace(result.PartOfSpeech) && meaning.TryGetProperty("partOfSpeech", out var posEl) && !string.IsNullOrWhiteSpace(posEl.GetString()))
                            {
                                result.PartOfSpeech = posEl.GetString();
                            }

                            if (meaning.TryGetProperty("definitions", out var defsEl) && defsEl.ValueKind == JsonValueKind.Array)
                            {
                                foreach (var def in defsEl.EnumerateArray())
                                {
                                    if (string.IsNullOrWhiteSpace(result.DefinitionEn) && def.TryGetProperty("definition", out var dEl) && !string.IsNullOrWhiteSpace(dEl.GetString()))
                                    {
                                        result.DefinitionEn = dEl.GetString();
                                    }
                                    if (string.IsNullOrWhiteSpace(result.Example) && def.TryGetProperty("example", out var exEl) && !string.IsNullOrWhiteSpace(exEl.GetString()))
                                    {
                                        result.Example = exEl.GetString();
                                    }
                                    if (!string.IsNullOrWhiteSpace(result.DefinitionEn) && !string.IsNullOrWhiteSpace(result.Example))
                                    {
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Dictionary API lookup failed for word {Word}", cleanWord);
        }

        // 3. Fallback native pronunciation audio via Google TTS if not provided by Free Dictionary API
        if (string.IsNullOrWhiteSpace(result.AudioUrl))
        {
            result.AudioUrl = $"https://translate.google.com/translate_tts?ie=UTF-8&tl=en&client=tw-ob&q={Uri.EscapeDataString(cleanWord)}";
        }

        // 4. Enrich via AI: obtain Vietnamese meaning and fill any missing dictionary fields
        bool needsEnrichment = string.IsNullOrWhiteSpace(result.MeaningVi)
            || string.IsNullOrWhiteSpace(result.Phonetic)
            || string.IsNullOrWhiteSpace(result.PartOfSpeech)
            || string.IsNullOrWhiteSpace(result.DefinitionEn)
            || string.IsNullOrWhiteSpace(result.Example);

        if (needsEnrichment)
        {
            try
            {
                using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                cts.CancelAfter(TimeSpan.FromSeconds(5));

                var prompt = $@"You are a concise English-Vietnamese dictionary assistant. Provide dictionary details for the English word/phrase: ""{cleanWord}"".
Respond ONLY with a JSON object:
{{
  ""meaningVi"": ""nghĩa tiếng Việt ngắn gọn và chính xác"",
  ""phonetic"": ""/phiên âm IPA/"",
  ""partOfSpeech"": ""noun/verb/adjective/adverb..."",
  ""definitionEn"": ""concise English definition"",
  ""example"": ""a natural example sentence in English""
}}";

                var wordModels = new[] { "gemini-2.5-flash-lite", "gemini-2.5-flash" };
                foreach (var wModel in wordModels)
                {
                    try
                    {
                        var aiRes = await _gemmaClient.CompleteWithModelAsync(prompt, wModel, cts.Token);
                        if (!string.IsNullOrWhiteSpace(aiRes))
                        {
                            PopulateMissingFieldsFromAi(result, aiRes);
                            if (!string.IsNullOrWhiteSpace(result.MeaningVi))
                            {
                                break;
                            }
                        }
                    }
                    catch
                    {
                        // Try next fallback model
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to get AI dictionary details for word {Word}", cleanWord);
            }
        }

        // 5. Fallback for MeaningVi via Google Translate if AI timed out or failed
        if (string.IsNullOrWhiteSpace(result.MeaningVi))
        {
            result.MeaningVi = await FetchGoogleTranslateAsync(cleanWord, "vi", cancellationToken);
        }

        // 6. Ensure default sensible values for remaining fields so all fields are populated
        if (string.IsNullOrWhiteSpace(result.PartOfSpeech))
        {
            result.PartOfSpeech = "vocabulary";
        }
        if (string.IsNullOrWhiteSpace(result.DefinitionEn))
        {
            result.DefinitionEn = !string.IsNullOrWhiteSpace(result.MeaningVi) ? result.MeaningVi : cleanWord;
        }

        // Store in 30-day RAM cache
        _cache.Set(cacheKey, result, TimeSpan.FromDays(30));
        return result;
    }

    private static void PopulateMissingFieldsFromAi(NewsDictionaryDto result, string aiText)
    {
        if (string.IsNullOrWhiteSpace(aiText)) return;
        var raw = aiText.Trim();

        // 1. Remove reasoning tags
        raw = Regex.Replace(raw, @"(?is)<(think|thought|reasoning)>.*?(</(think|thought|reasoning)>|$)", string.Empty).Trim();

        // 2. Strip orphaned closing tag
        var lastCloseIdx = Math.Max(
            raw.LastIndexOf("</thought>", StringComparison.OrdinalIgnoreCase),
            raw.LastIndexOf("</think>", StringComparison.OrdinalIgnoreCase)
        );
        if (lastCloseIdx >= 0)
        {
            var afterTag = raw.IndexOf('>', lastCloseIdx);
            if (afterTag >= 0 && afterTag < raw.Length - 1)
            {
                raw = raw.Substring(afterTag + 1).Trim();
            }
        }

        // 3. Strip markdown code fences
        if (raw.StartsWith("```json", StringComparison.OrdinalIgnoreCase))
        {
            raw = raw.Substring(7);
        }
        else if (raw.StartsWith("```"))
        {
            raw = raw.Substring(3);
        }
        if (raw.EndsWith("```"))
        {
            raw = raw.Substring(0, raw.Length - 3);
        }
        raw = raw.Trim();

        // 4. Try parsing JSON object
        try
        {
            using var doc = JsonDocument.Parse(raw);
            var root = doc.RootElement;
            if (root.ValueKind == JsonValueKind.Object)
            {
                if (string.IsNullOrWhiteSpace(result.MeaningVi))
                {
                    if (root.TryGetProperty("meaningVi", out var mVi) && !string.IsNullOrWhiteSpace(mVi.GetString()))
                        result.MeaningVi = mVi.GetString()!.Trim();
                    else if (root.TryGetProperty("translation", out var trans) && !string.IsNullOrWhiteSpace(trans.GetString()))
                        result.MeaningVi = trans.GetString()!.Trim();
                }

                if (string.IsNullOrWhiteSpace(result.Phonetic) && root.TryGetProperty("phonetic", out var ph) && !string.IsNullOrWhiteSpace(ph.GetString()))
                {
                    result.Phonetic = ph.GetString()!.Trim();
                }

                if (string.IsNullOrWhiteSpace(result.PartOfSpeech) && root.TryGetProperty("partOfSpeech", out var pos) && !string.IsNullOrWhiteSpace(pos.GetString()))
                {
                    result.PartOfSpeech = pos.GetString()!.Trim();
                }

                if (string.IsNullOrWhiteSpace(result.DefinitionEn) && root.TryGetProperty("definitionEn", out var defEn) && !string.IsNullOrWhiteSpace(defEn.GetString()))
                {
                    result.DefinitionEn = defEn.GetString()!.Trim();
                }

                if (string.IsNullOrWhiteSpace(result.Example) && root.TryGetProperty("example", out var ex) && !string.IsNullOrWhiteSpace(ex.GetString()))
                {
                    result.Example = ex.GetString()!.Trim();
                }

                return;
            }
        }
        catch
        {
            // Fallback to regex extraction
        }

        // Regex fallback
        if (string.IsNullOrWhiteSpace(result.MeaningVi))
        {
            var matchVi = Regex.Match(raw, @"""(?:meaningVi|translation)""\s*:\s*""((?:\\.|[^""\\])*)""");
            if (matchVi.Success) result.MeaningVi = UnescapeJsonString(matchVi.Groups[1].Value);
        }
        if (string.IsNullOrWhiteSpace(result.Phonetic))
        {
            var matchPh = Regex.Match(raw, @"""phonetic""\s*:\s*""((?:\\.|[^""\\])*)""");
            if (matchPh.Success) result.Phonetic = UnescapeJsonString(matchPh.Groups[1].Value);
        }
        if (string.IsNullOrWhiteSpace(result.PartOfSpeech))
        {
            var matchPos = Regex.Match(raw, @"""partOfSpeech""\s*:\s*""((?:\\.|[^""\\])*)""");
            if (matchPos.Success) result.PartOfSpeech = UnescapeJsonString(matchPos.Groups[1].Value);
        }
        if (string.IsNullOrWhiteSpace(result.DefinitionEn))
        {
            var matchDef = Regex.Match(raw, @"""definitionEn""\s*:\s*""((?:\\.|[^""\\])*)""");
            if (matchDef.Success) result.DefinitionEn = UnescapeJsonString(matchDef.Groups[1].Value);
        }
        if (string.IsNullOrWhiteSpace(result.Example))
        {
            var matchEx = Regex.Match(raw, @"""example""\s*:\s*""((?:\\.|[^""\\])*)""");
            if (matchEx.Success) result.Example = UnescapeJsonString(matchEx.Groups[1].Value);
        }

        if (string.IsNullOrWhiteSpace(result.MeaningVi))
        {
            var fallback = CleanTranslationResult(raw);
            if (!string.IsNullOrWhiteSpace(fallback))
            {
                result.MeaningVi = fallback;
            }
        }
    }

    private static string UnescapeJsonString(string value)
    {
        if (string.IsNullOrWhiteSpace(value)) return string.Empty;
        try
        {
            return Regex.Unescape(value).Trim();
        }
        catch
        {
            return value.Replace(@"\""", @"""").Replace(@"\n", "\n").Trim();
        }
    }

    private async Task<string> FetchGoogleTranslateAsync(string text, string targetLang = "vi", CancellationToken cancellationToken = default)
    {
        try
        {
            var url = $"https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl={targetLang}&dt=t&q={Uri.EscapeDataString(text)}";
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            cts.CancelAfter(TimeSpan.FromSeconds(3));

            using var response = await _httpClient.GetAsync(url, cts.Token);
            if (!response.IsSuccessStatusCode) return string.Empty;

            var json = await response.Content.ReadAsStringAsync(cts.Token);
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind == JsonValueKind.Array && doc.RootElement.GetArrayLength() > 0)
            {
                var firstArray = doc.RootElement[0];
                if (firstArray.ValueKind == JsonValueKind.Array)
                {
                    var sb = new StringBuilder();
                    foreach (var seg in firstArray.EnumerateArray())
                    {
                        if (seg.ValueKind == JsonValueKind.Array && seg.GetArrayLength() > 0)
                        {
                            sb.Append(seg[0].GetString());
                        }
                    }
                    return sb.ToString().Trim();
                }
            }
        }
        catch
        {
            // Ignore fallback failure
        }
        return string.Empty;
    }

    private static string CleanTranslationResult(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return string.Empty;
        var raw = text.Trim();

        // 1. Thoroughly remove reasoning tags: <think>...</think>, <thought>...</thought>, <reasoning>...</reasoning>
        raw = Regex.Replace(raw, @"(?is)<(think|thought|reasoning)>.*?(</(think|thought|reasoning)>|$)", string.Empty).Trim();

        // 2. If orphaned closing tag </thought> or </think> remains, strip everything before it
        var lastCloseIdx = Math.Max(
            raw.LastIndexOf("</thought>", StringComparison.OrdinalIgnoreCase),
            raw.LastIndexOf("</think>", StringComparison.OrdinalIgnoreCase)
        );
        if (lastCloseIdx >= 0)
        {
            var afterTag = raw.IndexOf('>', lastCloseIdx);
            if (afterTag >= 0 && afterTag < raw.Length - 1)
            {
                raw = raw.Substring(afterTag + 1).Trim();
            }
        }

        // 3. Strip markdown code fences
        if (raw.StartsWith("```json", StringComparison.OrdinalIgnoreCase))
        {
            raw = raw.Substring(7);
        }
        else if (raw.StartsWith("```"))
        {
            raw = raw.Substring(3);
        }
        if (raw.EndsWith("```"))
        {
            raw = raw.Substring(0, raw.Length - 3);
        }
        raw = raw.Trim();

        // 4. Attempt to extract "translation" or "meaningVi" property from JSON
        try
        {
            using var doc = JsonDocument.Parse(raw);
            if (doc.RootElement.TryGetProperty("translation", out var transProp))
            {
                var val = transProp.GetString();
                if (!string.IsNullOrWhiteSpace(val)) return val.Trim();
            }
            if (doc.RootElement.TryGetProperty("meaningVi", out var meanProp))
            {
                var val = meanProp.GetString();
                if (!string.IsNullOrWhiteSpace(val)) return val.Trim();
            }
        }
        catch
        {
            // Extract via regex if JSON payload is surrounded by extraneous text
            var match = Regex.Match(raw, @"""(?:translation|meaningVi)""\s*:\s*""((?:\\.|[^""\\])*)""");
            if (match.Success && match.Groups.Count > 1)
            {
                var val = match.Groups[1].Value;
                try
                {
                    return Regex.Unescape(val).Trim();
                }
                catch
                {
                    return val.Replace(@"\""", @"""").Replace(@"\n", "\n").Trim();
                }
            }
        }

        // 5. If plain text without JSON, remove common translation prefixes
        raw = Regex.Replace(raw, @"^(?:Translation|Bản dịch|Dịch nghĩa|Vietnamese translation):\s*", string.Empty, RegexOptions.IgnoreCase);

        // 6. Fallback: trim redundant outer quotes
        return raw.Trim('"', '\'', '`').Trim();
    }
}

