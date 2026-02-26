using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.DailyStreaks.Commands;

public record UpdateDailyStreakCommand(Guid UserId) : IRequest<DailyStreakResult>;
public record DailyStreakResult(Guid Id, Guid UserId, int CurrentStreak, int LongestStreak, DateTime? LastActivityDate);

public class UpdateDailyStreakCommandHandler(
    IGenericRepository<DailyStreak> repository
) : IRequestHandler<UpdateDailyStreakCommand, DailyStreakResult>
{
    public async Task<DailyStreakResult> Handle(UpdateDailyStreakCommand request, CancellationToken cancellationToken)
    {
        var existing = await repository.FindAsync(s => s.UserId == request.UserId);
        var streak = existing.FirstOrDefault();
        var today = DateTime.UtcNow.Date;

        if (streak is null)
        {
            streak = new DailyStreak
            {
                Id = Guid.NewGuid(),
                UserId = request.UserId,
                CurrentStreak = 1,
                LongestStreak = 1,
                LastActivityDate = today
            };
            await repository.AddAsync(streak);
        }
        else
        {
            var lastDate = streak.LastActivityDate?.Date;

            if (lastDate == today)
                return new DailyStreakResult(streak.Id, streak.UserId, streak.CurrentStreak,
                    streak.LongestStreak, streak.LastActivityDate);

            streak.CurrentStreak = lastDate == today.AddDays(-1)
                ? streak.CurrentStreak + 1
                : 1;

            streak.LongestStreak = Math.Max(streak.LongestStreak, streak.CurrentStreak);
            streak.LastActivityDate = today;
            repository.Update(streak);
        }

        await repository.SaveChangesAsync();
        return new DailyStreakResult(streak.Id, streak.UserId, streak.CurrentStreak,
            streak.LongestStreak, streak.LastActivityDate);
    }
}
