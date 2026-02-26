using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.Notifications.Commands;

public record MarkNotificationReadCommand(Guid NotificationId) : IRequest<bool>;
public record NotificationResult(Guid Id, Guid? UserId, string Title, string? Message, bool IsRead, DateTime CreatedAt);

public class MarkNotificationReadCommandHandler(
    IGenericRepository<Notification> repository
) : IRequestHandler<MarkNotificationReadCommand, bool>
{
    public async Task<bool> Handle(MarkNotificationReadCommand request, CancellationToken cancellationToken)
    {
        var entity = await repository.GetByIdAsync(request.NotificationId)
            ?? throw new KeyNotFoundException("Không tìm thấy thông báo.");
        entity.IsRead = true;
        repository.Update(entity);
        await repository.SaveChangesAsync();
        return true;
    }
}
