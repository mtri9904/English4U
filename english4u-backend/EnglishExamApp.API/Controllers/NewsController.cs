using System.Threading.Tasks;
using EnglishExamApp.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EnglishExamApp.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[AllowAnonymous]
public class NewsController : ControllerBase
{
    private readonly INewsService _newsService;

    public NewsController(INewsService newsService)
    {
        _newsService = newsService;
    }

    /// <summary>
    /// Fetch news list by category (travel, culture, lifestyle, business, science, technology, all)
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetNews(
        [FromQuery] string category = "all",
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? search = null)
    {
        var result = await _newsService.GetNewsListAsync(category, page, pageSize, search);
        return Ok(result);
    }

    /// <summary>
    /// Fetch full article detail including full HTML content and all illustration images
    /// </summary>
    [HttpGet("article")]
    public async Task<IActionResult> GetArticleDetail([FromQuery] string id)
    {
        if (string.IsNullOrWhiteSpace(id))
        {
            return BadRequest(new { message = "Tham số id của bài báo không được để trống." });
        }

        var article = await _newsService.GetArticleDetailAsync(id);
        if (article == null)
        {
            return NotFound(new { message = "Không tìm thấy nội dung chi tiết bài báo." });
        }

        return Ok(article);
    }

    /// <summary>
    /// Check daily request quota status for The Guardian API
    /// </summary>
    [HttpGet("quota")]
    public IActionResult GetQuota()
    {
        var quota = _newsService.GetQuotaStatus();
        return Ok(quota);
    }

    /// <summary>
    /// Translate news paragraph into natural Vietnamese (Gemma 4 AI + 7-day Cache)
    /// </summary>
    [HttpPost("translate")]
    public async Task<IActionResult> TranslateParagraph(
        [FromBody] EnglishExamApp.Application.DTOs.News.NewsTranslateRequestDto request,
        System.Threading.CancellationToken cancellationToken)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.Text))
        {
            return BadRequest(new { message = "Nội dung cần dịch không được để trống." });
        }

        var result = await _newsService.TranslateParagraphAsync(request, cancellationToken);
        return Ok(result);
    }

    /// <summary>
    /// Lookup academic dictionary and Vietnamese definition (Phonetic, Audio, Definition)
    /// </summary>
    [HttpGet("dictionary")]
    public async Task<IActionResult> LookupWord(
        [FromQuery] string word,
        [FromQuery] string? context = null,
        System.Threading.CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(word))
        {
            return BadRequest(new { message = "Từ vựng tra cứu không được để trống." });
        }

        var result = await _newsService.LookupWordAsync(word, context, cancellationToken);
        if (result == null)
        {
            return NotFound(new { message = "Không tìm thấy thông tin từ điển." });
        }

        return Ok(result);
    }
}

