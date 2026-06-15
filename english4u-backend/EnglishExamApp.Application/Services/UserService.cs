using EnglishExamApp.Application.DTOs.Users;
using EnglishExamApp.Application.Interfaces;
using EnglishExamApp.Application.Utilities;
using EnglishExamApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace EnglishExamApp.Application.Services;

public class UserService(IApplicationDbContext context) : IUserService
{
    private static readonly TimeSpan OnlineThreshold = TimeSpan.FromMinutes(2);
    private static readonly string[] ManagedRoles = ["Student", "Admin"];

    public async Task<bool> DeleteUserAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var user = await context.Users.FirstOrDefaultAsync(u => u.Id == id, cancellationToken);
        if (user is null) return false;

        context.Users.Remove(user);
        await context.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<PagedResult<UserOverviewDto>> GetPagedUsersAsync(UserPagedRequest request, CancellationToken cancellationToken = default)
    {
        var query = context.Users.AsNoTracking()
            .AsSplitQuery()
            .Include(u => u.UserRoles).ThenInclude(ur => ur.Role)
            .Include(u => u.UserSubscriptions).ThenInclude(us => us.Subscription)
            .Include(u => u.ExamSessions).ThenInclude(es => es.ScoringResults)
            .Where(u => u.UserRoles.Any(ur => ManagedRoles.Contains(ur.Role.Name)))
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(request.SearchTerm))
        {
            var search = request.SearchTerm.ToLower();
            query = query.Where(u => u.Email.ToLower().Contains(search) || 
                                     (u.DisplayName != null && u.DisplayName.ToLower().Contains(search)) ||
                                     (u.Phone != null && u.Phone.Contains(search)));
        }

        if (request.IsActive.HasValue)
        {
            query = query.Where(u => u.IsActive == request.IsActive.Value);
        }

        if (!string.IsNullOrWhiteSpace(request.SubscriptionId) && Guid.TryParse(request.SubscriptionId, out var subId))
        {
            query = query.Where(u => u.UserSubscriptions.Any(us => us.SubscriptionId == subId && us.Status == "Active"));
        }

        // Default sorting
        query = request.SortBy switch
        {
            "Email" => request.SortDescending ? query.OrderByDescending(u => u.Email) : query.OrderBy(u => u.Email),
            "DisplayName" => request.SortDescending ? query.OrderByDescending(u => u.DisplayName) : query.OrderBy(u => u.DisplayName),
            "LastLoginAt" => request.SortDescending ? query.OrderByDescending(u => u.LastLoginAt) : query.OrderBy(u => u.LastLoginAt),
            "LastSeenAt" => request.SortDescending ? query.OrderByDescending(u => u.LastSeenAt) : query.OrderBy(u => u.LastSeenAt),
            _ => request.SortDescending ? query.OrderByDescending(u => u.CreatedAt) : query.OrderBy(u => u.CreatedAt)
        };

        var totalCount = await query.CountAsync(cancellationToken);

        var pagedUsers = await query
            .Skip((request.PageNumber - 1) * request.PageSize)
            .Take(request.PageSize)
            .ToListAsync(cancellationToken);

        var onlineFrom = DateTime.UtcNow - OnlineThreshold;
        var items = pagedUsers.Select(u => {
            var activeSub = u.UserSubscriptions.FirstOrDefault(us => us.Status == "Active")?.Subscription?.Name ?? "Free";
            var completedSessions = u.ExamSessions.Where(es => es.Status == "Completed" || es.Status == "Scored").ToList();
            var avgScore = (completedSessions.Any() && completedSessions.SelectMany(s => s.ScoringResults).Any())
                ? completedSessions.SelectMany(s => s.ScoringResults).Average(r => r.TotalBandScore) ?? 0.0
                : 0.0;
            var isOnline = u.IsActive && u.IsOnline && u.LastSeenAt != null && u.LastSeenAt >= onlineFrom;
            
            return new UserOverviewDto(
                u.Id,
                u.Email,
                u.DisplayName,
                u.AvatarUrl,
                u.Phone,
                u.IsActive,
                isOnline,
                VietnamDateTimeFormatter.ToDisplay(u.CreatedAt)!,
                VietnamDateTimeFormatter.ToDisplay(u.LastLoginAt),
                VietnamDateTimeFormatter.ToDisplay(u.LastSeenAt),
                u.UserRoles.FirstOrDefault()?.Role?.Name ?? "User",
                activeSub,
                CalculateIeltsLevel(avgScore),
                Math.Round(avgScore, 1)
            );
        }).ToList();

        return new PagedResult<UserOverviewDto>(items, totalCount, request.PageNumber, request.PageSize);
    }

    public async Task<UserDetailDto?> GetUserDetailAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var user = await context.Users
            .AsNoTracking()
            .AsSplitQuery()
            .Include(u => u.UserRoles).ThenInclude(ur => ur.Role)
            .Include(u => u.UserSubscriptions).ThenInclude(us => us.Subscription)
            .Include(u => u.ExamSessions).ThenInclude(es => es.ScoringResults)
            .Include(u => u.ExamSessions).ThenInclude(es => es.Exam)
            .FirstOrDefaultAsync(u => u.Id == id, cancellationToken);

        if (user is null) return null;

        var completedSessions = user.ExamSessions
            .Where(es => es.Status == "Completed" || es.Status == "Scored")
            .OrderByDescending(es => es.EndedAt)
            .ToList();

        var totalExamsTaken = completedSessions.Count;
        var averageScore = (totalExamsTaken > 0 && completedSessions.SelectMany(s => s.ScoringResults).Any())
            ? completedSessions.SelectMany(s => s.ScoringResults).Average(r => r.TotalBandScore) ?? 0.0
            : 0.0;
        var onlineFrom = DateTime.UtcNow - OnlineThreshold;
        var isOnline = user.IsActive && user.IsOnline && user.LastSeenAt != null && user.LastSeenAt >= onlineFrom;

        var recentSessions = completedSessions.Take(5).Select(s => new UserSessionHistoryDto(
            s.Id,
            s.Exam.Title,
            VietnamDateTimeFormatter.ToDisplay(s.EndedAt ?? DateTime.UtcNow)!,
            s.ScoringResults.FirstOrDefault()?.TotalBandScore ?? 0
        )).ToList();

        return new UserDetailDto(
            user.Id,
            user.Email,
            user.DisplayName,
            user.AvatarUrl,
            user.Phone,
            user.Department,
            user.Position,
            user.Notes,
            user.IsActive,
            isOnline,
            VietnamDateTimeFormatter.ToDisplay(user.CreatedAt)!,
            VietnamDateTimeFormatter.ToDisplay(user.LastLoginAt),
            VietnamDateTimeFormatter.ToDisplay(user.LastSeenAt),
            user.UserRoles.FirstOrDefault()?.Role?.Name ?? "User",
            user.UserSubscriptions.FirstOrDefault(us => us.Status == "Active")?.Subscription?.Name ?? "Free",
            CalculateIeltsLevel(averageScore),
            totalExamsTaken,
            Math.Round(averageScore, 2),
            recentSessions
        );
    }

    public async Task<UserManagementStatsDto> GetUserManagementStatsAsync(CancellationToken cancellationToken = default)
    {
        var usersQuery = context.Users.Where(u => u.UserRoles.Any(ur => ManagedRoles.Contains(ur.Role.Name)));

        var totalUsers = await usersQuery.CountAsync(cancellationToken);
        var activeUsers = await usersQuery.CountAsync(u => u.IsActive, cancellationToken);
        var onlineFrom = DateTime.UtcNow - OnlineThreshold;
        var onlineUsers = await usersQuery.CountAsync(
            u => u.IsActive && u.IsOnline && u.LastSeenAt != null && u.LastSeenAt >= onlineFrom,
            cancellationToken);
        
        var premiumUsers = await context.UserSubscriptions
            .Where(us =>
                us.Status == "Active"
                && us.Subscription.Name != "Free"
                && us.User.UserRoles.Any(ur => ManagedRoles.Contains(ur.Role.Name)))
            .Select(us => us.UserId)
            .Distinct()
            .CountAsync(cancellationToken);

        var results = await context.ScoringResults
            .Select(r => r.TotalBandScore)
            .ToListAsync(cancellationToken);
            
        var globalAvg = results.Any(r => r.HasValue) ? results.Average() ?? 0.0 : 0.0;

        return new UserManagementStatsDto(
            totalUsers,
            activeUsers,
            onlineUsers,
            Math.Round(globalAvg, 1),
            premiumUsers
        );
    }

    public async Task<bool> ToggleUserStatusAsync(Guid id, bool isActive, CancellationToken cancellationToken = default)
    {
        var user = await context.Users.FirstOrDefaultAsync(u => u.Id == id, cancellationToken);
        if (user is null) return false;

        user.IsActive = isActive;
        if (!isActive)
        {
            user.IsOnline = false;
        }
        user.UpdatedAt = DateTime.UtcNow;

        await context.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> UpdateUserRoleAsync(Guid id, string roleName, CancellationToken cancellationToken = default)
    {
        var user = await context.Users
            .Include(u => u.UserRoles)
            .FirstOrDefaultAsync(u => u.Id == id, cancellationToken);
        
        if (user is null) return false;

        var role = await context.Roles.FirstOrDefaultAsync(r => r.Name == roleName, cancellationToken);
        if (role is null) return false;

        // Currently handle one role per user
        context.UserRoles.RemoveRange(user.UserRoles);
        context.UserRoles.Add(new UserRole { UserId = user.Id, RoleId = role.Id });

        user.UpdatedAt = DateTime.UtcNow;
        await context.SaveChangesAsync(cancellationToken);
        return true;
    }

    private static string CalculateIeltsLevel(double score)
    {
        return score switch
        {
            >= 8.5 => "C2",
            >= 7.0 => "C1",
            >= 5.5 => "B2",
            >= 4.0 => "B1",
            >= 3.0 => "A2",
            _ => "A1"
        };
    }
}
