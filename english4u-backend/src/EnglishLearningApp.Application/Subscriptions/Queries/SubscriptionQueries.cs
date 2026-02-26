using EnglishLearningApp.Application.Subscriptions.Commands;
using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.Subscriptions.Queries;

public record GetAllSubscriptionsQuery : IRequest<IEnumerable<SubscriptionResult>>;
public record GetSubscriptionByIdQuery(Guid Id) : IRequest<SubscriptionResult>;

public class GetAllSubscriptionsQueryHandler(
    IGenericRepository<Subscription> repository
) : IRequestHandler<GetAllSubscriptionsQuery, IEnumerable<SubscriptionResult>>
{
    public async Task<IEnumerable<SubscriptionResult>> Handle(GetAllSubscriptionsQuery request, CancellationToken cancellationToken)
    {
        var list = await repository.FindAsync(s => s.IsActive);
        return list.Select(s => new SubscriptionResult(s.Id, s.Name, s.Price,
            s.DurationDays, s.Features, s.IsActive, s.CreatedAt));
    }
}

public class GetSubscriptionByIdQueryHandler(
    IGenericRepository<Subscription> repository
) : IRequestHandler<GetSubscriptionByIdQuery, SubscriptionResult>
{
    public async Task<SubscriptionResult> Handle(GetSubscriptionByIdQuery request, CancellationToken cancellationToken)
    {
        var entity = await repository.GetByIdAsync(request.Id)
            ?? throw new KeyNotFoundException("Không tìm thấy gói cước.");
        return new SubscriptionResult(entity.Id, entity.Name, entity.Price,
            entity.DurationDays, entity.Features, entity.IsActive, entity.CreatedAt);
    }
}
