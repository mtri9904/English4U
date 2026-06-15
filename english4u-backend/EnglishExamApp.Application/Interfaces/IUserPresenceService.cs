using EnglishExamApp.Domain.Entities;

namespace EnglishExamApp.Application.Interfaces;

public interface IUserPresenceService
{
    Task MarkLoggedInAsync(User user, CancellationToken cancellationToken = default);

    Task<UserPresenceHeartbeatResult> HeartbeatAsync(Guid userId, CancellationToken cancellationToken = default);

    Task<bool> MarkOfflineAsync(Guid userId, CancellationToken cancellationToken = default);

    Task PublishPresenceChangedAsync(CancellationToken cancellationToken = default);
}

public sealed record UserPresenceHeartbeatResult(UserPresenceHeartbeatStatus Status);

public enum UserPresenceHeartbeatStatus
{
    NotFound,
    Inactive,
    Updated
}
