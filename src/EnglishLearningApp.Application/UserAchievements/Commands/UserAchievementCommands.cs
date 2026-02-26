using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.UserAchievements.Commands;

public record GrantUserAchievementCommand(Guid UserId, Guid AchievementId) : IRequest<UserAchievementResult>;
public record UserAchievementResult(Guid Id, Guid UserId, Guid AchievementId, DateTime UnlockedAt);

public class GrantUserAchievementCommandHandler(
    IGenericRepository<UserAchievement> repository
) : IRequestHandler<GrantUserAchievementCommand, UserAchievementResult>
{
    public async Task<UserAchievementResult> Handle(GrantUserAchievementCommand request, CancellationToken cancellationToken)
    {
        var existing = await repository.FindAsync(
            ua => ua.UserId == request.UserId && ua.AchievementId == request.AchievementId);

        if (existing.Any())
            throw new InvalidOperationException("User đã có thành tích này.");

        var entity = new UserAchievement
        {
            Id = Guid.NewGuid(),
            UserId = request.UserId,
            AchievementId = request.AchievementId,
            UnlockedAt = DateTime.UtcNow
        };
        await repository.AddAsync(entity);
        await repository.SaveChangesAsync();
        return new UserAchievementResult(entity.Id, entity.UserId, entity.AchievementId, entity.UnlockedAt);
    }
}
