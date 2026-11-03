using System.Threading;
using System.Threading.Tasks;
using EnglishExamApp.Application.DTOs.News;

namespace EnglishExamApp.Application.Interfaces;

public interface INewsService
{
    Task<NewsListResponseDto> GetNewsListAsync(string category = "all", int page = 1, int pageSize = 20, string? search = null, bool forceRefresh = false);
    Task<NewsArticleDto?> GetArticleDetailAsync(string articleId);
    NewsQuotaStatusDto GetQuotaStatus();
    Task<NewsTranslateResponseDto> TranslateParagraphAsync(NewsTranslateRequestDto request, CancellationToken cancellationToken = default);
    Task<NewsDictionaryDto?> LookupWordAsync(string word, CancellationToken cancellationToken = default);
}

