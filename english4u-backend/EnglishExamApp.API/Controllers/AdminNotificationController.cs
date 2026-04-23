using EnglishExamApp.Application.Interfaces;
using EnglishExamApp.Application.Utilities;
using EnglishExamApp.API.Realtime;
using EnglishExamApp.Domain.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EnglishExamApp.API.Controllers;

[ApiController]
[Route("api/admin/notifications")]
public class AdminNotificationController(
    IApplicationDbContext context,
    IRealtimeEventDispatcher realtimeDispatcher) : ControllerBase
{
    public sealed record NotificationPagedRequest(
        int PageNumber = 1,
        int PageSize = 10,
        string? SearchTerm = null,
        bool? IsRead = null,
        string? Role = null);

    public sealed record NotificationListItemDto(
        Guid Id,
        Guid UserId,
        string UserDisplayName,
        string UserEmail,
        string UserRole,
        string Title,
        string? Message,
        bool IsRead,
        string CreatedAt);

    public sealed record NotificationStatsDto(int Total, int Unread, int CreatedToday);
    public sealed record PagedResult<T>(IReadOnlyList<T> Items, int TotalCount, int PageNumber, int PageSize);
    public sealed record BroadcastNotificationRequest(string Title, string? Message, string TargetRole = "Student");
    public sealed record UpdateNotificationRequest(string Title, string? Message);
    public sealed record UpdateReadStatusRequest(bool IsRead);

    [HttpGet]
    public async Task<IResult> GetPagedNotifications([FromQuery] NotificationPagedRequest request, CancellationToken cancellationToken)
    {
        var pageNumber = request.PageNumber <= 0 ? 1 : request.PageNumber;
        var pageSize = request.PageSize <= 0 ? 10 : Math.Min(request.PageSize, 100);
        var normalizedRole = string.IsNullOrWhiteSpace(request.Role) ? null : request.Role.Trim();
        var normalizedSearch = string.IsNullOrWhiteSpace(request.SearchTerm)
            ? null
            : request.SearchTerm.Trim().ToLower();

        var query = context.Notifications
            .AsNoTracking()
            .Include(n => n.User)
            .ThenInclude(u => u.UserRoles)
            .ThenInclude(ur => ur.Role)
            .AsQueryable();

        if (request.IsRead.HasValue)
        {
            query = query.Where(n => n.IsRead == request.IsRead.Value);
        }

        if (!string.IsNullOrWhiteSpace(normalizedRole) && !normalizedRole.Equals("ALL", StringComparison.OrdinalIgnoreCase))
        {
            query = query.Where(n => n.User.UserRoles.Any(ur => ur.Role.Name == normalizedRole));
        }

        if (!string.IsNullOrWhiteSpace(normalizedSearch))
        {
            query = query.Where(n =>
                n.Title.ToLower().Contains(normalizedSearch) ||
                (n.Message != null && n.Message.ToLower().Contains(normalizedSearch)) ||
                n.User.Email.ToLower().Contains(normalizedSearch) ||
                (n.User.DisplayName != null && n.User.DisplayName.ToLower().Contains(normalizedSearch)));
        }

        var rawNotifications = await query
            .OrderByDescending(n => n.CreatedAt)
            .Select(n => new
            {
                n.Id,
                n.UserId,
                n.User.DisplayName,
                n.User.Email,
                UserRole = n.User.UserRoles.Select(ur => ur.Role.Name).FirstOrDefault() ?? "User",
                n.Title,
                n.Message,
                n.IsRead,
                n.CreatedAt
            })
            .ToListAsync(cancellationToken);

        var groupedNotifications = rawNotifications
            .GroupBy(n => new { n.Title, n.Message, CreatedAtBatch = TruncateToTenSecondsUtc(n.CreatedAt) })
            .Select(group =>
            {
                var first = group.First();
                var userCount = group.Select(x => x.UserId).Distinct().Count();
                var distinctRoles = group.Select(x => x.UserRole).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
                var hasUnread = group.Any(x => !x.IsRead);

                return new
                {
                    first.Id,
                    first.UserId,
                    first.Title,
                    first.Message,
                    CreatedAtUtc = group.Key.CreatedAtBatch,
                    UserDisplayName = userCount == 1
                        ? (string.IsNullOrWhiteSpace(first.DisplayName) ? GetDisplayNameFromEmail(first.Email) : first.DisplayName!)
                        : $"{userCount} người nhận",
                    UserEmail = userCount == 1 ? first.Email : $"{userCount} tài khoản",
                    UserRole = distinctRoles.Count == 1 ? distinctRoles[0] : "ALL",
                    IsRead = !hasUnread,
                };
            })
            .OrderByDescending(x => x.CreatedAtUtc)
            .ToList();

        var totalCount = groupedNotifications.Count;
        var notifications = groupedNotifications
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .Select(n => new NotificationListItemDto(
                n.Id,
                n.UserId,
                n.UserDisplayName,
                n.UserEmail,
                n.UserRole,
                n.Title,
                n.Message,
                n.IsRead,
                VietnamDateTimeFormatter.ToDisplay(n.CreatedAtUtc)!
            ))
            .ToList();

        return TypedResults.Ok(new PagedResult<NotificationListItemDto>(notifications, totalCount, pageNumber, pageSize));
    }

    [HttpGet("stats")]
    public async Task<IResult> GetNotificationStats(CancellationToken cancellationToken)
    {
        var vietnamTimeZone = ResolveVietnamTimeZone();
        var nowVn = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, vietnamTimeZone);
        var todayStartVn = nowVn.Date;
        var todayEndVn = todayStartVn.AddDays(1);
        var todayStartUtc = TimeZoneInfo.ConvertTimeToUtc(todayStartVn, vietnamTimeZone);
        var todayEndUtc = TimeZoneInfo.ConvertTimeToUtc(todayEndVn, vietnamTimeZone);

        var rawNotifications = await context.Notifications
            .AsNoTracking()
            .Select(n => new { n.Title, n.Message, n.CreatedAt, n.IsRead })
            .ToListAsync(cancellationToken);

        var groupedNotifications = rawNotifications
            .GroupBy(n => new { n.Title, n.Message, CreatedAtBatch = TruncateToTenSecondsUtc(n.CreatedAt) })
            .Select(group => new
            {
                CreatedAt = group.Key.CreatedAtBatch,
                IsRead = group.All(x => x.IsRead),
            })
            .ToList();

        var total = groupedNotifications.Count;
        var unread = groupedNotifications.Count(x => !x.IsRead);
        var createdToday = groupedNotifications.Count(
            x => x.CreatedAt >= todayStartUtc && x.CreatedAt < todayEndUtc);

        return TypedResults.Ok(new NotificationStatsDto(total, unread, createdToday));
    }

    [HttpPost("broadcast")]
    public async Task<IResult> BroadcastNotification([FromBody] BroadcastNotificationRequest request, CancellationToken cancellationToken)
    {
        var normalizedTitle = request.Title?.Trim();
        if (string.IsNullOrWhiteSpace(normalizedTitle))
        {
            return TypedResults.BadRequest(new { message = "Title is required." });
        }

        var normalizedTargetRole = string.IsNullOrWhiteSpace(request.TargetRole)
            ? "Student"
            : request.TargetRole.Trim();

        var usersQuery = context.Users
            .AsNoTracking()
            .Include(u => u.UserRoles)
            .ThenInclude(ur => ur.Role)
            .Where(u => u.IsActive)
            .AsQueryable();

        if (!normalizedTargetRole.Equals("ALL", StringComparison.OrdinalIgnoreCase))
        {
            usersQuery = usersQuery.Where(u => u.UserRoles.Any(ur => ur.Role.Name == normalizedTargetRole));
        }

        var userIds = await usersQuery.Select(u => u.Id).ToListAsync(cancellationToken);
        if (userIds.Count == 0)
        {
            return TypedResults.BadRequest(new { message = "No users found for selected target role." });
        }

        var batchCreatedAtUtc = TruncateToSecondUtc(DateTime.UtcNow);
        var normalizedMessage = string.IsNullOrWhiteSpace(request.Message) ? null : request.Message.Trim();
        var notifications = userIds.Select(userId => new Notification
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Title = normalizedTitle,
            Message = normalizedMessage,
            IsRead = false,
            CreatedAt = batchCreatedAtUtc,
        }).ToList();

        await context.Notifications.AddRangeAsync(notifications, cancellationToken);
        await context.SaveChangesAsync(cancellationToken);

        // Keep all records in one broadcast batch with the exact same timestamp.
        // This avoids split rows in admin CMS when DB defaults or precision differ per row.
        foreach (var notification in notifications)
        {
            notification.CreatedAt = batchCreatedAtUtc;
        }
        await context.SaveChangesAsync(cancellationToken);
        await PublishNotificationChangedAsync(cancellationToken);

        return TypedResults.Ok(new { message = "Broadcast notification created successfully.", createdCount = userIds.Count });
    }

    [HttpPatch("{id:guid}")]
    public async Task<IResult> UpdateNotification([FromRoute] Guid id, [FromBody] UpdateNotificationRequest request, CancellationToken cancellationToken)
    {
        var normalizedTitle = request.Title?.Trim();
        if (string.IsNullOrWhiteSpace(normalizedTitle))
        {
            return TypedResults.BadRequest(new { message = "Title is required." });
        }

        var batchNotifications = await GetNotificationBatchByIdAsync(id, cancellationToken);
        if (batchNotifications is null || batchNotifications.Count == 0)
        {
            return TypedResults.NotFound(new { message = "Notification batch not found." });
        }

        var normalizedMessage = string.IsNullOrWhiteSpace(request.Message) ? null : request.Message.Trim();
        foreach (var item in batchNotifications)
        {
            item.Title = normalizedTitle;
            item.Message = normalizedMessage;
        }

        await context.SaveChangesAsync(cancellationToken);
        await PublishNotificationChangedAsync(cancellationToken);
        return TypedResults.Ok(new { message = "Notification updated successfully.", updatedCount = batchNotifications.Count });
    }

    [HttpDelete("{id:guid}")]
    public async Task<IResult> DeleteNotification([FromRoute] Guid id, CancellationToken cancellationToken)
    {
        var batchNotifications = await GetNotificationBatchByIdAsync(id, cancellationToken);
        if (batchNotifications is null || batchNotifications.Count == 0)
        {
            return TypedResults.NotFound(new { message = "Notification batch not found." });
        }

        context.Notifications.RemoveRange(batchNotifications);
        await context.SaveChangesAsync(cancellationToken);
        await PublishNotificationChangedAsync(cancellationToken);
        return TypedResults.Ok(new { message = "Notification deleted successfully.", deletedCount = batchNotifications.Count });
    }

    [HttpPatch("{id:guid}/read")]
    public async Task<IResult> UpdateReadStatus([FromRoute] Guid id, [FromBody] UpdateReadStatusRequest request, CancellationToken cancellationToken)
    {
        var batchNotifications = await GetNotificationBatchByIdAsync(id, cancellationToken);
        if (batchNotifications is null || batchNotifications.Count == 0)
        {
            return TypedResults.NotFound(new { message = "Notification batch not found." });
        }

        foreach (var item in batchNotifications)
        {
            item.IsRead = request.IsRead;
        }
        await context.SaveChangesAsync(cancellationToken);
        await PublishNotificationChangedAsync(cancellationToken);

        return TypedResults.Ok(new { message = "Notification read status updated.", updatedCount = batchNotifications.Count });
    }

    [HttpPatch("mark-all-read")]
    public async Task<IResult> MarkAllAsRead(CancellationToken cancellationToken)
    {
        var unreadNotifications = await context.Notifications
            .Where(n => !n.IsRead)
            .ToListAsync(cancellationToken);

        if (unreadNotifications.Count == 0)
        {
            return TypedResults.Ok(new { message = "No unread notifications." });
        }

        foreach (var notification in unreadNotifications)
        {
            notification.IsRead = true;
        }

        await context.SaveChangesAsync(cancellationToken);
        await PublishNotificationChangedAsync(cancellationToken);
        return TypedResults.Ok(new { message = "All notifications marked as read.", updatedCount = unreadNotifications.Count });
    }

    private static TimeZoneInfo ResolveVietnamTimeZone()
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById("SE Asia Standard Time");
        }
        catch
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById("Asia/Ho_Chi_Minh");
            }
            catch
            {
                return TimeZoneInfo.Utc;
            }
        }
    }

    private static string GetDisplayNameFromEmail(string email)
    {
        if (string.IsNullOrWhiteSpace(email))
        {
            return "user";
        }

        var atIndex = email.IndexOf('@');
        return atIndex > 0 ? email[..atIndex] : email;
    }

    private static DateTime TruncateToSecondUtc(DateTime value)
    {
        var utc = value.Kind == DateTimeKind.Utc ? value : DateTime.SpecifyKind(value, DateTimeKind.Utc);
        return new DateTime(utc.Ticks - (utc.Ticks % TimeSpan.TicksPerSecond), DateTimeKind.Utc);
    }

    private static DateTime TruncateToTenSecondsUtc(DateTime value)
    {
        var utc = value.Kind == DateTimeKind.Utc ? value : DateTime.SpecifyKind(value, DateTimeKind.Utc);
        var bucketTicks = TimeSpan.FromSeconds(10).Ticks;
        return new DateTime(utc.Ticks - (utc.Ticks % bucketTicks), DateTimeKind.Utc);
    }

    private async Task<List<Notification>?> GetNotificationBatchByIdAsync(Guid id, CancellationToken cancellationToken)
    {
        var seed = await context.Notifications
            .AsNoTracking()
            .Select(n => new { n.Id, n.Title, n.Message, n.CreatedAt })
            .FirstOrDefaultAsync(n => n.Id == id, cancellationToken);

        if (seed is null)
        {
            return null;
        }

        var batchStart = TruncateToTenSecondsUtc(seed.CreatedAt);
        return await context.Notifications
            .Where(n =>
                n.Title == seed.Title &&
                n.Message == seed.Message &&
                n.CreatedAt >= batchStart &&
                n.CreatedAt < batchStart.AddSeconds(10))
            .ToListAsync(cancellationToken);
    }

    private Task PublishNotificationChangedAsync(CancellationToken cancellationToken) =>
        realtimeDispatcher.PublishAsync(RealtimeEventTypes.NotificationsChanged, cancellationToken: cancellationToken);
}
