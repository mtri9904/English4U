using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using EnglishExamApp.Application.Interfaces;

namespace EnglishExamApp.API.Realtime;

public static class RealtimeEventTypes
{
    public const string NotificationsChanged = "notifications.changed";
    public const string ExamsChanged = "exams.changed";
    public const string UsersPresenceChanged = "users.presence.changed";
    public const string ExamPdfGenerationProgress = "exam.pdf-generation.progress";
}

public interface IRealtimeEventDispatcher : IRealtimeEventPublisher
{
    Task HandleConnectionAsync(WebSocket socket, CancellationToken cancellationToken);
}

public sealed class RealtimeEventDispatcher(ILogger<RealtimeEventDispatcher> logger) : IRealtimeEventDispatcher
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly ConcurrentDictionary<Guid, WebSocket> _sockets = new();

    public async Task HandleConnectionAsync(WebSocket socket, CancellationToken cancellationToken)
    {
        var connectionId = Guid.NewGuid();
        _sockets[connectionId] = socket;
        var buffer = new byte[1024];

        try
        {
            await PublishAsync("connection.ready", new { connectionId }, cancellationToken);

            while (!cancellationToken.IsCancellationRequested && socket.State == WebSocketState.Open)
            {
                var result = await socket.ReceiveAsync(buffer, cancellationToken);
                if (result.MessageType == WebSocketMessageType.Close)
                {
                    break;
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Request aborted / app shutting down.
        }
        catch (WebSocketException ex)
        {
            logger.LogDebug(ex, "WebSocket connection error for {ConnectionId}", connectionId);
        }
        finally
        {
            _sockets.TryRemove(connectionId, out _);
            await TryCloseSocketAsync(socket);
        }
    }

    public async Task PublishAsync(string eventType, object? payload = null, CancellationToken cancellationToken = default)
    {
        if (_sockets.IsEmpty)
        {
            return;
        }

        var envelope = new RealtimeEventEnvelope(
            eventType,
            payload,
            DateTime.UtcNow);
        var bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(envelope, JsonOptions));
        var staleConnections = new List<Guid>();

        foreach (var entry in _sockets)
        {
            var socket = entry.Value;
            if (socket.State != WebSocketState.Open)
            {
                staleConnections.Add(entry.Key);
                continue;
            }

            try
            {
                await socket.SendAsync(bytes, WebSocketMessageType.Text, endOfMessage: true, cancellationToken);
            }
            catch (OperationCanceledException)
            {
                return;
            }
            catch (WebSocketException ex)
            {
                logger.LogDebug(ex, "WebSocket send failed for {ConnectionId}", entry.Key);
                staleConnections.Add(entry.Key);
            }
            catch (ObjectDisposedException)
            {
                staleConnections.Add(entry.Key);
            }
        }

        foreach (var connectionId in staleConnections)
        {
            _sockets.TryRemove(connectionId, out _);
        }
    }

    private static async Task TryCloseSocketAsync(WebSocket socket)
    {
        try
        {
            if (socket.State is WebSocketState.Open or WebSocketState.CloseReceived)
            {
                await socket.CloseAsync(
                    WebSocketCloseStatus.NormalClosure,
                    "Connection closed",
                    CancellationToken.None);
            }
        }
        catch
        {
            // Ignore close errors.
        }
    }
}

public sealed record RealtimeEventEnvelope(string Type, object? Payload, DateTime TimestampUtc);
