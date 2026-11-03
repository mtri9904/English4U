using System;
using System.Collections.Generic;

namespace EnglishExamApp.Application.DTOs.News;

public class NewsArticleDto
{
    public string Id { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string? BodyHtml { get; set; }
    public string Link { get; set; } = string.Empty;
    public string? Author { get; set; }
    public DateTime PublishDate { get; set; }
    public string? Thumbnail { get; set; }
    public string? MainImageUrl { get; set; }
    public string? MainImageCaption { get; set; }
    public string Category { get; set; } = string.Empty;
    public string CategoryLabel { get; set; } = string.Empty;
    public string Source { get; set; } = "The Guardian";
    public int ReadingTime { get; set; } = 3;
}

public class NewsListResponseDto
{
    public List<NewsArticleDto> Items { get; set; } = new();
    public string Category { get; set; } = string.Empty;
    public int Total { get; set; }
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 20;
    public bool IsCached { get; set; }
    public int DailyQuotaUsed { get; set; }
    public int DailyQuotaRemaining { get; set; }
}

public class NewsQuotaStatusDto
{
    public int UsedToday { get; set; }
    public int MaxDailyLimit { get; set; } = 500;
    public int SafeDailyLimit { get; set; } = 480;
    public int RemainingToday { get; set; }
    public DateTime ResetTimeUtc { get; set; }
}

public class NewsTranslateRequestDto
{
    public string Text { get; set; } = string.Empty;
    public string? ArticleId { get; set; }
    public int? ParagraphIndex { get; set; }
}

public class NewsTranslateResponseDto
{
    public string TranslatedText { get; set; } = string.Empty;
    public bool IsCached { get; set; }
    public string ModelUsed { get; set; } = string.Empty;
}

public class NewsDictionaryDto
{
    public string Word { get; set; } = string.Empty;
    public string? Phonetic { get; set; }
    public string? PartOfSpeech { get; set; }
    public string? MeaningVi { get; set; }
    public string? DefinitionEn { get; set; }
    public string? AudioUrl { get; set; }
    public string? Example { get; set; }
}

