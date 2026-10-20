using System.Security.Claims;
using EnglishExamApp.Application.DTOs.Flashcard;
using EnglishExamApp.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EnglishExamApp.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class FlashcardController(
    IFlashcardService flashcardService,
    IApplicationDbContext context) : ControllerBase
{
    private Guid GetCurrentUserId()
    {
        var claim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                 ?? User.FindFirst("sub")?.Value
                 ?? User.FindFirst("id")?.Value;

        if (Guid.TryParse(claim, out var uid))
        {
            return uid;
        }

        // Fallback for non-authenticated testing: use first student/admin
        var user = context.Users.FirstOrDefault();
        return user?.Id ?? Guid.Empty;
    }

    #region Decks

    [HttpGet("decks")]
    public async Task<IActionResult> GetDecks(CancellationToken cancellationToken)
    {
        var userId = GetCurrentUserId();
        var decks = await flashcardService.GetDecksAsync(userId, cancellationToken);
        return Ok(decks);
    }

    [HttpGet("decks/{id:guid}")]
    public async Task<IActionResult> GetDeckById(Guid id, CancellationToken cancellationToken)
    {
        var userId = GetCurrentUserId();
        var deck = await flashcardService.GetDeckByIdAsync(id, userId, cancellationToken);
        if (deck == null) return NotFound(new { message = "Không tìm thấy bộ thẻ." });
        return Ok(deck);
    }

    [HttpPost("decks")]
    public async Task<IActionResult> CreateDeck([FromBody] CreateDeckRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Title))
        {
            return BadRequest(new { message = "Tiêu đề bộ thẻ không được để trống." });
        }

        var userId = GetCurrentUserId();
        var deck = await flashcardService.CreateDeckAsync(userId, request, cancellationToken);
        return CreatedAtAction(nameof(GetDeckById), new { id = deck.Id }, deck);
    }

    [HttpPut("decks/{id:guid}")]
    public async Task<IActionResult> UpdateDeck(Guid id, [FromBody] UpdateDeckRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Title))
        {
            return BadRequest(new { message = "Tiêu đề bộ thẻ không được để trống." });
        }

        var userId = GetCurrentUserId();
        var deck = await flashcardService.UpdateDeckAsync(id, userId, request, cancellationToken);
        if (deck == null) return NotFound(new { message = "Không tìm thấy bộ thẻ hoặc bạn không có quyền sửa." });
        return Ok(deck);
    }

    [HttpDelete("decks/{id:guid}")]
    public async Task<IActionResult> DeleteDeck(Guid id, CancellationToken cancellationToken)
    {
        var userId = GetCurrentUserId();
        var success = await flashcardService.DeleteDeckAsync(id, userId, cancellationToken);
        if (!success) return NotFound(new { message = "Không tìm thấy bộ thẻ hoặc bạn không có quyền xóa." });
        return Ok(new { message = "Xóa bộ thẻ thành công." });
    }

    #endregion

    #region Cards

    [HttpGet("decks/{deckId:guid}/cards")]
    public async Task<IActionResult> GetCardsInDeck(Guid deckId, CancellationToken cancellationToken)
    {
        var userId = GetCurrentUserId();
        var cards = await flashcardService.GetCardsInDeckAsync(deckId, userId, cancellationToken);
        return Ok(cards);
    }

    [HttpGet("decks/{deckId:guid}/study")]
    public async Task<IActionResult> GetStudyCards(Guid deckId, [FromQuery] bool dueOnly = false, CancellationToken cancellationToken = default)
    {
        var userId = GetCurrentUserId();
        var cards = await flashcardService.GetStudyCardsAsync(deckId, userId, dueOnly, cancellationToken);
        return Ok(cards);
    }

    [HttpPost("items")]
    public async Task<IActionResult> CreateCard([FromBody] CreateFlashcardItemRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Word) || string.IsNullOrWhiteSpace(request.MeaningVi))
        {
            return BadRequest(new { message = "Từ vựng và nghĩa tiếng Việt là bắt buộc." });
        }

        var userId = GetCurrentUserId();
        var card = await flashcardService.CreateCardAsync(userId, request, cancellationToken);
        return Ok(card);
    }

    [HttpPut("items/{id:guid}")]
    public async Task<IActionResult> UpdateCard(Guid id, [FromBody] UpdateFlashcardItemRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Word) || string.IsNullOrWhiteSpace(request.MeaningVi))
        {
            return BadRequest(new { message = "Từ vựng và nghĩa tiếng Việt là bắt buộc." });
        }

        var userId = GetCurrentUserId();
        var card = await flashcardService.UpdateCardAsync(id, userId, request, cancellationToken);
        if (card == null) return NotFound(new { message = "Không tìm thấy thẻ hoặc bạn không có quyền sửa." });
        return Ok(card);
    }

    [HttpDelete("items/{id:guid}")]
    public async Task<IActionResult> DeleteCard(Guid id, CancellationToken cancellationToken)
    {
        var userId = GetCurrentUserId();
        var success = await flashcardService.DeleteCardAsync(id, userId, cancellationToken);
        if (!success) return NotFound(new { message = "Không tìm thấy thẻ hoặc bạn không có quyền xóa." });
        return Ok(new { message = "Xóa thẻ thành công." });
    }

    [HttpPost("items/{id:guid}/review")]
    public async Task<IActionResult> ReviewCard(Guid id, [FromBody] ReviewCardRequest request, CancellationToken cancellationToken)
    {
        if (request.Rating < 1 || request.Rating > 4)
        {
            return BadRequest(new { message = "Đánh giá phải từ 1 (Again) đến 4 (Easy)." });
        }

        var userId = GetCurrentUserId();
        var card = await flashcardService.ReviewCardAsync(id, userId, request.Rating, cancellationToken);
        if (card == null) return NotFound(new { message = "Không tìm thấy thẻ." });
        return Ok(card);
    }

    #endregion

    #region AI Endpoints

    [HttpPost("ai/enrich")]
    public async Task<IActionResult> EnrichWord([FromBody] AiEnrichWordRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Word))
        {
            return BadRequest(new { message = "Từ vựng cần phân tích không được để trống." });
        }

        var result = await flashcardService.EnrichWordWithAiAsync(request.Word, request.Context, request.PreferredModel, cancellationToken);
        return Ok(result);
    }

    [HttpPost("ai/check-sentence")]
    public async Task<IActionResult> CheckSentence([FromBody] AiCheckSentenceRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Word) || string.IsNullOrWhiteSpace(request.Sentence))
        {
            return BadRequest(new { message = "Từ vựng và câu cần kiểm tra không được để trống." });
        }

        var result = await flashcardService.CheckSentenceWithAiAsync(request.Word, request.MeaningVi, request.Sentence, request.PreferredModel, cancellationToken);
        return Ok(result);
    }

    #endregion
}
