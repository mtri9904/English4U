namespace EnglishExamApp.Application.Interfaces;

public interface IRealtimeEventPublisher
{
    Task PublishAsync(string eventType, object? payload = null, CancellationToken cancellationToken = default);
}
