using EnglishExamApp.API.Realtime;
using EnglishExamApp.API.Authentication;
using EnglishExamApp.Application.Interfaces;
using EnglishExamApp.Application.Realtime;
using EnglishExamApp.Application.Utilities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EnglishExamApp.API.Controllers;

[ApiController]
[Route("api/notifications")]
[Authorize]
public class NotificationController(
    IApplicationDbContext context,
    IRealtimeEventDispatcher realtimeDispatcher,
    ICurrentUserService currentUser) : ControllerBase
{
    public sealed record NotificationPagedRequest(int PageNumber = 1, int PageSize = 8);
    public sealed record NotificationListItemDto(Guid Id, string Title, string? Message, bool IsRead, string CreatedAt);
    public sealed record NotificationStatsDto(int Total, int Unread);
    public sealed record PagedResult<T>(IReadOnlyList<T> Items, int TotalCount, int PageNumber, int PageSize);
    public sealed record UpdateReadStatusRequest(bool IsRead);

    [HttpGet("my")]
    public async Task<IResult> GetMyNotifications(
        [FromQuery] NotificationPagedRequest request,
        CancellationToken cancellationToken)
    {
        if (!currentUser.TryGetUserId(out var userId))
            return TypedResults.Unauthorized();

        var pageNumber = request.PageNumber <= 0 ? 1 : request.PageNumber;
        var pageSize = request.PageSize <= 0 ? 8 : Math.Min(request.PageSize, 50);

        var query = context.Notifications
            .AsNoTracking()
            .Where(n => n.UserId == userId);

        var totalCount = await query.CountAsync(cancellationToken);
        var items = await query
            .OrderByDescending(n => n.CreatedAt)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .Select(n => new NotificationListItemDto(
                n.Id,
                n.Title,
                n.Message,
                n.IsRead,
                VietnamDateTimeFormatter.ToDisplay(n.CreatedAt)!
            ))
            .ToListAsync(cancellationToken);

        return TypedResults.Ok(new PagedResult<NotificationListItemDto>(items, totalCount, pageNumber, pageSize));
    }

    [HttpGet("my/stats")]
    public async Task<IResult> GetMyNotificationStats(
        CancellationToken cancellationToken)
    {
        if (!currentUser.TryGetUserId(out var userId))
            return TypedResults.Unauthorized();

        var total = await context.Notifications.CountAsync(n => n.UserId == userId, cancellationToken);
        var unread = await context.Notifications.CountAsync(n => n.UserId == userId && !n.IsRead, cancellationToken);

        return TypedResults.Ok(new NotificationStatsDto(total, unread));
    }

    [HttpPatch("{id:guid}/read")]
    public async Task<IResult> UpdateReadStatus(
        [FromRoute] Guid id,
        [FromBody] UpdateReadStatusRequest request,
        CancellationToken cancellationToken)
    {
        if (!currentUser.TryGetUserId(out var userId))
            return TypedResults.Unauthorized();

        var notification = await context.Notifications
            .FirstOrDefaultAsync(n => n.Id == id && n.UserId == userId, cancellationToken);
        if (notification is null)
            return TypedResults.NotFound(new { message = "Notification not found." });

        notification.IsRead = request.IsRead;
        await context.SaveChangesAsync(cancellationToken);
        await PublishNotificationChangedAsync(cancellationToken);
        return TypedResults.Ok(new { message = "Notification read status updated." });
    }

    [HttpPatch("my/mark-all-read")]
    public async Task<IResult> MarkAllAsRead(
        CancellationToken cancellationToken)
    {
        if (!currentUser.TryGetUserId(out var userId))
            return TypedResults.Unauthorized();

        var unreadNotifications = await context.Notifications
            .Where(n => n.UserId == userId && !n.IsRead)
            .ToListAsync(cancellationToken);

        if (unreadNotifications.Count == 0)
            return TypedResults.Ok(new { message = "No unread notifications.", updatedCount = 0 });

        foreach (var notification in unreadNotifications)
        {
            notification.IsRead = true;
        }

        await context.SaveChangesAsync(cancellationToken);
        await PublishNotificationChangedAsync(cancellationToken);
        return TypedResults.Ok(new { message = "All notifications marked as read.", updatedCount = unreadNotifications.Count });
    }

    private Task PublishNotificationChangedAsync(CancellationToken cancellationToken) =>
        realtimeDispatcher.PublishAsync(RealtimeEventTypes.NotificationsChanged, cancellationToken: cancellationToken);
}
