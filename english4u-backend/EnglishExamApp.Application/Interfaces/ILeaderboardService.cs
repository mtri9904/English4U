using EnglishExamApp.Application.DTOs.Leaderboard;

namespace EnglishExamApp.Application.Interfaces;

public interface ILeaderboardService
{
    Task<LeaderboardOverviewDto> GetLeaderboardOverviewAsync(
        Guid currentUserId,
        string category = "diligence",
        string period = "week",
        CancellationToken cancellationToken = default);

    Task<List<BadgeItemDto>> GetUserBadgesAsync(
        Guid currentUserId,
        CancellationToken cancellationToken = default);

    Task<List<WeeklyQuestDto>> GetWeeklyQuestsAsync(
        Guid currentUserId,
        CancellationToken cancellationToken = default);

    Task<ClaimQuestRewardResponseDto> ClaimQuestRewardAsync(
        Guid currentUserId,
        string questId,
        CancellationToken cancellationToken = default);

    Task<AdminLeaderboardOverviewDto> GetAdminLeaderboardOverviewAsync(
        string category = "diligence",
        string period = "week",
        CancellationToken cancellationToken = default);
}
