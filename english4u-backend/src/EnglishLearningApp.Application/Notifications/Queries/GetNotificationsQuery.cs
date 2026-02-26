using EnglishLearningApp.Application.Notifications.Commands;
using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.Notifications.Queries;

public record GetNotificationsQuery(Guid UserId) : IRequest<IEnumerable<NotificationResult>>;

public class GetNotificationsQueryHandler(
    IGenericRepository<Notification> repository
) : IRequestHandler<GetNotificationsQuery, IEnumerable<NotificationResult>>
{
    public async Task<IEnumerable<NotificationResult>> Handle(GetNotificationsQuery request, CancellationToken cancellationToken)
    {
        var list = await repository.FindAsync(n => n.UserId == request.UserId);
        return list.Select(n => new NotificationResult(n.Id, n.UserId, n.Title, n.Message, n.IsRead, n.CreatedAt))
                   .OrderByDescending(n => n.CreatedAt);
    }
}
