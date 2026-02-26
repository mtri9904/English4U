using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.Subscriptions.Queries;

public record GetUserSubscriptionsQuery(Guid UserId) : IRequest<IEnumerable<UserSubscriptionResult>>;
public record GetActiveUserSubscriptionQuery(Guid UserId) : IRequest<UserSubscriptionResult?>;

public record UserSubscriptionResult(
    Guid Id,
    Guid UserId,
    Guid SubscriptionId,
    DateTime StartDate,
    DateTime EndDate,
    string? Status
);

public class GetUserSubscriptionsQueryHandler(
    IGenericRepository<UserSubscription> repository
) : IRequestHandler<GetUserSubscriptionsQuery, IEnumerable<UserSubscriptionResult>>
{
    public async Task<IEnumerable<UserSubscriptionResult>> Handle(GetUserSubscriptionsQuery request, CancellationToken cancellationToken)
    {
        var list = await repository.FindAsync(us => us.UserId == request.UserId);
        return list.Select(us => new UserSubscriptionResult(
            us.Id, us.UserId, us.SubscriptionId, us.StartDate, us.EndDate, us.Status))
            .OrderByDescending(us => us.StartDate);
    }
}

public class GetActiveUserSubscriptionQueryHandler(
    IGenericRepository<UserSubscription> repository
) : IRequestHandler<GetActiveUserSubscriptionQuery, UserSubscriptionResult?>
{
    public async Task<UserSubscriptionResult?> Handle(GetActiveUserSubscriptionQuery request, CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        var list = await repository.FindAsync(
            us => us.UserId == request.UserId && us.Status == "ACTIVE" && us.EndDate > now);
        var active = list.FirstOrDefault();
        if (active is null) return null;
        return new UserSubscriptionResult(
            active.Id, active.UserId, active.SubscriptionId,
            active.StartDate, active.EndDate, active.Status);
    }
}
