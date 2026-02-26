using EnglishLearningApp.Application.DailyStreaks.Commands;
using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.DailyStreaks.Queries;

public record GetDailyStreakQuery(Guid UserId) : IRequest<DailyStreakResult?>;

public class GetDailyStreakQueryHandler(
    IGenericRepository<DailyStreak> repository
) : IRequestHandler<GetDailyStreakQuery, DailyStreakResult?>
{
    public async Task<DailyStreakResult?> Handle(GetDailyStreakQuery request, CancellationToken cancellationToken)
    {
        var list = await repository.FindAsync(s => s.UserId == request.UserId);
        var streak = list.FirstOrDefault();
        if (streak is null) return null;
        return new DailyStreakResult(streak.Id, streak.UserId, streak.CurrentStreak,
            streak.LongestStreak, streak.LastActivityDate);
    }
}
