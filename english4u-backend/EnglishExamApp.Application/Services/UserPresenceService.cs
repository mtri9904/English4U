using EnglishExamApp.Application.Interfaces;
using EnglishExamApp.Application.Realtime;
using EnglishExamApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace EnglishExamApp.Application.Services;

public sealed class UserPresenceService(
    IApplicationDbContext context,
    IRealtimeEventPublisher realtimeEventPublisher) : IUserPresenceService
{
    public async Task MarkLoggedInAsync(User user, CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        user.LastLoginAt = now;
        user.LastSeenAt = now;
        user.IsOnline = true;
        user.UpdatedAt = now;

        await context.SaveChangesAsync(cancellationToken);
        await PublishPresenceChangedAsync(cancellationToken);
    }

    public async Task<UserPresenceHeartbeatResult> HeartbeatAsync(
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        var user = await context.Users.FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);
        if (user is null)
        {
            return new UserPresenceHeartbeatResult(UserPresenceHeartbeatStatus.NotFound);
        }

        if (!user.IsActive)
        {
            var wasOnline = user.IsOnline;
            user.IsOnline = false;

            await context.SaveChangesAsync(cancellationToken);
            if (wasOnline)
            {
                await PublishPresenceChangedAsync(cancellationToken);
            }

            return new UserPresenceHeartbeatResult(UserPresenceHeartbeatStatus.Inactive);
        }

        var wasPreviouslyOnline = user.IsOnline;
        var now = DateTime.UtcNow;
        user.LastSeenAt = now;
        user.IsOnline = true;
        user.UpdatedAt = now;

        await context.SaveChangesAsync(cancellationToken);
        if (!wasPreviouslyOnline)
        {
            await PublishPresenceChangedAsync(cancellationToken);
        }

        return new UserPresenceHeartbeatResult(UserPresenceHeartbeatStatus.Updated);
    }

    public async Task<bool> MarkOfflineAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var user = await context.Users.FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);
        if (user is null)
        {
            return false;
        }

        var wasOnline = user.IsOnline;
        var now = DateTime.UtcNow;
        user.LastSeenAt = now;
        user.IsOnline = false;
        user.UpdatedAt = now;

        await context.SaveChangesAsync(cancellationToken);
        if (wasOnline)
        {
            await PublishPresenceChangedAsync(cancellationToken);
        }

        return true;
    }

    public Task PublishPresenceChangedAsync(CancellationToken cancellationToken = default) =>
        realtimeEventPublisher.PublishAsync(RealtimeEventTypes.UsersPresenceChanged, cancellationToken: cancellationToken);
}
