using EnglishExamApp.Application.Billing;
using EnglishExamApp.Application.Interfaces;
using EnglishExamApp.Application.Utilities;
using EnglishExamApp.Domain.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EnglishExamApp.API.Controllers;

[ApiController]
[Route("api/admin/billing")]
[Authorize(Roles = "Admin")]
public class AdminBillingController(IApplicationDbContext context) : ControllerBase
{
    public sealed record BillingOverviewDto(
        int TotalPackages,
        int ActivePackages,
        int TotalTransactions,
        int SuccessfulTransactions,
        int PendingTransactions,
        decimal TotalRevenue);

    public sealed record SubscriptionListItemDto(
        Guid Id,
        string Name,
        decimal Price,
        int DurationDays,
        string? Features,
        bool IsActive,
        int ActiveUsers);

    public sealed record SubscriptionUpsertRequest(
        string Name,
        decimal Price,
        int DurationDays,
        string? Features,
        bool IsActive = true);

    public sealed record ToggleSubscriptionStatusRequest(bool IsActive);

    public sealed record PaymentPagedRequest(
        int PageNumber = 1,
        int PageSize = 10,
        string? SearchTerm = null,
        string? Status = null,
        string? Method = null);

    public sealed record PaymentListItemDto(
        Guid Id,
        Guid UserId,
        string UserDisplayName,
        string UserEmail,
        string? SubscriptionName,
        decimal Amount,
        string? PaymentMethod,
        string? Status,
        string? TransactionId,
        string CreatedAt);

    public sealed record PagedResult<T>(IReadOnlyList<T> Items, int TotalCount, int PageNumber, int PageSize);

    [HttpGet("overview")]
    public async Task<IResult> GetOverview(CancellationToken cancellationToken)
    {
        var totalPackages = await context.Subscriptions.CountAsync(cancellationToken);
        var activePackages = await context.Subscriptions.CountAsync(s => s.IsActive, cancellationToken);
        var totalTransactions = await context.Payments.CountAsync(cancellationToken);
        var successfulTransactions = await context.Payments.CountAsync(p => p.Status == "Success", cancellationToken);
        var pendingTransactions = await context.Payments.CountAsync(p => p.Status == "Pending", cancellationToken);
        var totalRevenue = await context.Payments
            .Where(p => p.Status == "Success")
            .Select(p => (decimal?)p.Amount)
            .SumAsync(cancellationToken) ?? 0m;

        return TypedResults.Ok(new BillingOverviewDto(
            totalPackages,
            activePackages,
            totalTransactions,
            successfulTransactions,
            pendingTransactions,
            totalRevenue
        ));
    }

    [HttpGet("subscriptions")]
    public async Task<IResult> GetSubscriptions(CancellationToken cancellationToken)
    {
        var nowUtc = DateTime.UtcNow;
        var activeUsersBySubscription = await context.UserSubscriptions
            .AsNoTracking()
            .Where(us => us.Status == "Active" && us.EndDate >= nowUtc)
            .GroupBy(us => us.SubscriptionId)
            .Select(group => new
            {
                SubscriptionId = group.Key,
                ActiveUsers = group.Select(x => x.UserId).Distinct().Count(),
            })
            .ToListAsync(cancellationToken);

        var activeUsersMap = activeUsersBySubscription.ToDictionary(x => x.SubscriptionId, x => x.ActiveUsers);
        var rawSubscriptions = await context.Subscriptions
            .AsNoTracking()
            .OrderByDescending(s => s.IsActive)
            .ThenBy(s => s.Price)
            .ThenBy(s => s.Name)
            .ToListAsync(cancellationToken);

        var subscriptions = rawSubscriptions
            .Select(s => new SubscriptionListItemDto(
                s.Id,
                s.Name,
                s.Price,
                s.DurationDays,
                s.Features,
                s.IsActive,
                activeUsersMap.TryGetValue(s.Id, out var activeUsers) ? activeUsers : 0
            ))
            .ToList();

        return TypedResults.Ok(subscriptions);
    }

    [HttpPost("subscriptions")]
    public async Task<IResult> CreateSubscription([FromBody] SubscriptionUpsertRequest request, CancellationToken cancellationToken)
    {
        var normalizedName = request.Name?.Trim();
        if (string.IsNullOrWhiteSpace(normalizedName))
        {
            return TypedResults.BadRequest(new { message = "Tên gói không được để trống." });
        }

        if (request.Price < 0)
        {
            return TypedResults.BadRequest(new { message = "Giá gói không hợp lệ." });
        }

        if (request.DurationDays <= 0)
        {
            return TypedResults.BadRequest(new { message = "Thời lượng gói phải lớn hơn 0 ngày." });
        }

        var duplicated = await context.Subscriptions
            .AsNoTracking()
            .AnyAsync(s => s.Name.ToLower() == normalizedName.ToLower(), cancellationToken);
        if (duplicated)
        {
            return TypedResults.BadRequest(new { message = "Tên gói đã tồn tại." });
        }

        var subscription = new Subscription
        {
            Id = Guid.NewGuid(),
            Name = normalizedName,
            Price = decimal.Round(request.Price, 2),
            DurationDays = request.DurationDays,
            Features = string.IsNullOrWhiteSpace(request.Features) ? null : request.Features.Trim(),
            IsActive = request.IsActive,
        };

        await context.Subscriptions.AddAsync(subscription, cancellationToken);
        await context.SaveChangesAsync(cancellationToken);

        return TypedResults.Ok(new { message = "Tạo gói thành công.", subscriptionId = subscription.Id });
    }

    [HttpPut("subscriptions/{id:guid}")]
    public async Task<IResult> UpdateSubscription([FromRoute] Guid id, [FromBody] SubscriptionUpsertRequest request, CancellationToken cancellationToken)
    {
        var normalizedName = request.Name?.Trim();
        if (string.IsNullOrWhiteSpace(normalizedName))
        {
            return TypedResults.BadRequest(new { message = "Tên gói không được để trống." });
        }

        if (request.Price < 0)
        {
            return TypedResults.BadRequest(new { message = "Giá gói không hợp lệ." });
        }

        if (request.DurationDays <= 0)
        {
            return TypedResults.BadRequest(new { message = "Thời lượng gói phải lớn hơn 0 ngày." });
        }

        var subscription = await context.Subscriptions.FirstOrDefaultAsync(s => s.Id == id, cancellationToken);
        if (subscription is null)
        {
            return TypedResults.NotFound(new { message = "Không tìm thấy gói cần cập nhật." });
        }

        var duplicated = await context.Subscriptions
            .AsNoTracking()
            .AnyAsync(s => s.Id != id && s.Name.ToLower() == normalizedName.ToLower(), cancellationToken);
        if (duplicated)
        {
            return TypedResults.BadRequest(new { message = "Tên gói đã tồn tại." });
        }

        subscription.Name = normalizedName;
        subscription.Price = decimal.Round(request.Price, 2);
        subscription.DurationDays = request.DurationDays;
        subscription.Features = string.IsNullOrWhiteSpace(request.Features) ? null : request.Features.Trim();
        subscription.IsActive = request.IsActive;

        await context.SaveChangesAsync(cancellationToken);
        return TypedResults.Ok(new { message = "Cập nhật gói thành công." });
    }

    [HttpPatch("subscriptions/{id:guid}/status")]
    public async Task<IResult> ToggleSubscriptionStatus(
        [FromRoute] Guid id,
        [FromBody] ToggleSubscriptionStatusRequest request,
        CancellationToken cancellationToken)
    {
        var subscription = await context.Subscriptions.FirstOrDefaultAsync(s => s.Id == id, cancellationToken);
        if (subscription is null)
        {
            return TypedResults.NotFound(new { message = "Không tìm thấy gói." });
        }

        subscription.IsActive = request.IsActive;
        await context.SaveChangesAsync(cancellationToken);
        return TypedResults.Ok(new { message = $"Đã {(request.IsActive ? "mở" : "ẩn")} gói {subscription.Name}." });
    }

    [HttpGet("payments")]
    public async Task<IResult> GetPayments([FromQuery] PaymentPagedRequest request, CancellationToken cancellationToken)
    {
        var pageNumber = request.PageNumber <= 0 ? 1 : request.PageNumber;
        var pageSize = request.PageSize <= 0 ? 10 : Math.Min(request.PageSize, 100);
        var normalizedSearch = string.IsNullOrWhiteSpace(request.SearchTerm) ? null : request.SearchTerm.Trim().ToLower();
        var normalizedStatus = string.IsNullOrWhiteSpace(request.Status) ? null : request.Status.Trim();
        var normalizedMethod = string.IsNullOrWhiteSpace(request.Method) ? null : request.Method.Trim();

        var query = context.Payments
            .AsNoTracking()
            .Include(p => p.User)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(normalizedStatus) && !normalizedStatus.Equals("ALL", StringComparison.OrdinalIgnoreCase))
        {
            query = query.Where(p => p.Status == normalizedStatus);
        }

        if (!string.IsNullOrWhiteSpace(normalizedMethod) && !normalizedMethod.Equals("ALL", StringComparison.OrdinalIgnoreCase))
        {
            query = query.Where(p => p.PaymentMethod == normalizedMethod);
        }

        if (!string.IsNullOrWhiteSpace(normalizedSearch))
        {
            query = query.Where(p =>
                p.User.Email.ToLower().Contains(normalizedSearch) ||
                (p.User.DisplayName != null && p.User.DisplayName.ToLower().Contains(normalizedSearch)) ||
                (p.TransactionId != null && p.TransactionId.ToLower().Contains(normalizedSearch)));
        }

        var totalCount = await query.CountAsync(cancellationToken);
        var rawPayments = await query
            .OrderByDescending(p => p.CreatedAt)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .Select(p => new
            {
                p.Id,
                p.UserId,
                p.User.Email,
                p.User.DisplayName,
                p.Amount,
                p.PaymentMethod,
                p.Status,
                p.TransactionId,
                p.CreatedAt,
            })
            .ToListAsync(cancellationToken);

        var subscriptionIds = rawPayments
            .Select(p => PaymentTransactionMetadata.ExtractSubscriptionId(p.TransactionId))
            .Where(id => id.HasValue)
            .Select(id => id!.Value)
            .Distinct()
            .ToList();

        var subscriptionMap = await context.Subscriptions
            .AsNoTracking()
            .Where(s => subscriptionIds.Contains(s.Id))
            .ToDictionaryAsync(s => s.Id, s => s.Name, cancellationToken);

        var payments = rawPayments
            .Select(p =>
            {
                var subscriptionId = PaymentTransactionMetadata.ExtractSubscriptionId(p.TransactionId);
                subscriptionMap.TryGetValue(subscriptionId ?? Guid.Empty, out var subscriptionName);

                return new PaymentListItemDto(
                    p.Id,
                    p.UserId,
                    UserDisplayNameFormatter.FromDisplayNameOrEmail(p.DisplayName, p.Email),
                    p.Email,
                    subscriptionName,
                    p.Amount,
                    p.PaymentMethod,
                    p.Status,
                    p.TransactionId,
                    VietnamDateTimeFormatter.ToDisplay(p.CreatedAt)!
                );
            })
            .ToList();

        return TypedResults.Ok(new PagedResult<PaymentListItemDto>(payments, totalCount, pageNumber, pageSize));
    }

}
