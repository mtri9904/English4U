using System.Security.Claims;
using EnglishExamApp.Application.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace EnglishExamApp.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class LeaderboardController(
    ILeaderboardService leaderboardService,
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

        // Fallback for non-authenticated testing: use first student/admin in DB
        var user = context.Users.FirstOrDefault();
        return user?.Id ?? Guid.Empty;
    }

    [HttpGet]
    public async Task<IActionResult> GetOverview(
        [FromQuery] string category = "diligence",
        [FromQuery] string period = "week",
        CancellationToken cancellationToken = default)
    {
        var userId = GetCurrentUserId();
        var result = await leaderboardService.GetLeaderboardOverviewAsync(userId, category, period, cancellationToken);
        return Ok(result);
    }

    [HttpGet("admin-summary")]
    public async Task<IActionResult> GetAdminSummary(
        [FromQuery] string category = "diligence",
        [FromQuery] string period = "week",
        CancellationToken cancellationToken = default)
    {
        var result = await leaderboardService.GetAdminLeaderboardOverviewAsync(category, period, cancellationToken);
        return Ok(result);
    }

    [HttpGet("badges")]
    public async Task<IActionResult> GetBadges(CancellationToken cancellationToken = default)
    {
        var userId = GetCurrentUserId();
        var badges = await leaderboardService.GetUserBadgesAsync(userId, cancellationToken);
        return Ok(badges);
    }

    [HttpGet("quests")]
    public async Task<IActionResult> GetWeeklyQuests(CancellationToken cancellationToken = default)
    {
        var userId = GetCurrentUserId();
        var quests = await leaderboardService.GetWeeklyQuestsAsync(userId, cancellationToken);
        return Ok(quests);
    }

    [HttpPost("quests/{questId}/claim")]
    public async Task<IActionResult> ClaimQuestReward(
        string questId,
        CancellationToken cancellationToken = default)
    {
        var userId = GetCurrentUserId();
        var result = await leaderboardService.ClaimQuestRewardAsync(userId, questId, cancellationToken);
        return Ok(result);
    }
}

