using EnglishLearningApp.Application.UserAchievements.Commands;
using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.UserAchievements.Queries;

public record GetUserAchievementsQuery(Guid UserId) : IRequest<IEnumerable<UserAchievementResult>>;

public class GetUserAchievementsQueryHandler(
    IGenericRepository<UserAchievement> repository
) : IRequestHandler<GetUserAchievementsQuery, IEnumerable<UserAchievementResult>>
{
    public async Task<IEnumerable<UserAchievementResult>> Handle(GetUserAchievementsQuery request, CancellationToken cancellationToken)
    {
        var list = await repository.FindAsync(ua => ua.UserId == request.UserId);
        return list.Select(ua => new UserAchievementResult(ua.Id, ua.UserId, ua.AchievementId, ua.UnlockedAt));
    }
}
