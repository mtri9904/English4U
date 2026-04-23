using EnglishExamApp.API.Realtime;
using EnglishExamApp.Application.Interfaces;
using EnglishExamApp.Application.Utilities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;

namespace EnglishExamApp.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class UserController(
    IApplicationDbContext context,
    IRealtimeEventDispatcher realtimeDispatcher) : ControllerBase
{
    private static readonly TimeSpan OnlineThreshold = TimeSpan.FromMinutes(2);
    private static readonly string[] ManagedRoles = ["Student", "Admin"];

    public sealed record StudentListItemDto(
        Guid Id,
        string FullName,
        string Email,
        string? Phone,
        string? Department,
        string? Position,
        bool IsActive,
        bool IsOnline,
        string? LastSeenAt,
        string? LastLoginAt,
        string CreatedAt);

    public sealed record UpdateProfileRequest(
        string DisplayName, 
        string? AvatarUrl, 
        string? Bio, 
        string? Phone, 
        string? Department, 
        string? Position, 
        string? Notes);

    public sealed record UpdateStudentActiveRequest(bool IsActive);
    public sealed record ChangePasswordRequest(string OldPassword, string NewPassword);

    [HttpGet("profile")]
    public async Task<IResult> GetProfile([FromHeader(Name = "X-User-Id")] string? userIdStr, CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(userIdStr, out var userId)) 
            return TypedResults.Unauthorized();

        var rawProfile = await context.Users
            .Select(u => new
            {
                u.Id,
                u.Email,
                u.DisplayName,
                u.AvatarUrl,
                u.Phone,
                u.Department,
                u.Position,
                u.Notes,
                u.IsActive,
                u.IsOnline,
                u.LastSeenAt,
                u.LastLoginAt,
                Role = u.UserRoles.FirstOrDefault()!.Role.Name,
                u.CreatedAt
            })
            .FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);

        if (rawProfile is null)
            return TypedResults.NotFound();

        var profile = new
        {
            rawProfile.Id,
            rawProfile.Email,
            rawProfile.DisplayName,
            rawProfile.AvatarUrl,
            rawProfile.Phone,
            rawProfile.Department,
            rawProfile.Position,
            rawProfile.Notes,
            rawProfile.IsActive,
            rawProfile.IsOnline,
            LastSeenAt = VietnamDateTimeFormatter.ToDisplay(rawProfile.LastSeenAt),
            LastLoginAt = VietnamDateTimeFormatter.ToDisplay(rawProfile.LastLoginAt),
            Role = rawProfile.Role,
            CreatedAt = VietnamDateTimeFormatter.ToDisplay(rawProfile.CreatedAt),
        };

        return TypedResults.Ok(profile);
    }

    [HttpPut("profile")]
    public async Task<IResult> UpdateProfile(
        [FromHeader(Name = "X-User-Id")] string? userIdStr,
        [FromBody] UpdateProfileRequest request,
        CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(userIdStr, out var userId)) 
            return TypedResults.Unauthorized();

        var user = await context.Users.FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);
        if (user is null) return TypedResults.NotFound();

        user.DisplayName = request.DisplayName;
        user.AvatarUrl = request.AvatarUrl;
        user.Phone = request.Phone;
        user.Department = request.Department;
        user.Position = request.Position;
        user.Notes = request.Notes;
        user.UpdatedAt = DateTime.UtcNow;

        await context.SaveChangesAsync(cancellationToken);
        return TypedResults.Ok(new { message = "Profile updated successfully" });
    }

    [HttpPut("change-password")]
    public async Task<IResult> ChangePassword(
        [FromHeader(Name = "X-User-Id")] string? userIdStr,
        [FromBody] ChangePasswordRequest request,
        CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(userIdStr, out var userId)) 
            return TypedResults.Unauthorized();

        var user = await context.Users.FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);
        if (user is null) return TypedResults.NotFound();

        if (!VerifyPassword(request.OldPassword, user.PasswordHash))
            return TypedResults.BadRequest(new { message = "Mật khẩu cũ không chính xác" });

        user.PasswordHash = HashPassword(request.NewPassword);
        user.UpdatedAt = DateTime.UtcNow;

        await context.SaveChangesAsync(cancellationToken);
        return TypedResults.Ok(new { message = "Password updated successfully" });
    }

    [HttpGet("students")]
    public async Task<IResult> GetStudents(CancellationToken cancellationToken)
    {
        var onlineFrom = DateTime.UtcNow - OnlineThreshold;

        var studentsData = await context.Users
            .Where(u => u.UserRoles.Any(ur => ManagedRoles.Contains(ur.Role.Name)))
            .Select(u => new {
                u.Id,
                u.DisplayName,
                u.Email,
                u.Phone,
                u.Department,
                u.Position,
                u.IsActive,
                u.IsOnline,
                u.LastSeenAt,
                u.LastLoginAt,
                u.CreatedAt
            })
            .OrderByDescending(u => u.LastSeenAt ?? u.CreatedAt)
            .ToListAsync(cancellationToken);

        var students = studentsData
            .Select(u => new StudentListItemDto(
                u.Id,
                string.IsNullOrWhiteSpace(u.DisplayName) ? u.Email.Split('@')[0] : u.DisplayName!,
                u.Email,
                u.Phone,
                u.Department,
                u.Position,
                u.IsActive,
                u.IsActive && u.IsOnline && u.LastSeenAt != null && u.LastSeenAt >= onlineFrom,
                VietnamDateTimeFormatter.ToDisplay(u.LastSeenAt),
                VietnamDateTimeFormatter.ToDisplay(u.LastLoginAt),
                VietnamDateTimeFormatter.ToDisplay(u.CreatedAt)!
            ))
            .ToList();

        return TypedResults.Ok(students);
    }

    [HttpPut("students/{studentId:guid}/active")]
    public async Task<IResult> UpdateStudentActive(
        [FromRoute] Guid studentId,
        [FromBody] UpdateStudentActiveRequest request,
        CancellationToken cancellationToken)
    {
        var student = await context.Users
            .FirstOrDefaultAsync(u => u.Id == studentId, cancellationToken);

        if (student is null)
            return TypedResults.NotFound();

        student.IsActive = request.IsActive;
        student.UpdatedAt = DateTime.UtcNow;
        var shouldPublishPresenceChanged = false;

        if (!request.IsActive)
        {
            var wasOnline = student.IsOnline;
            student.IsOnline = false;
            shouldPublishPresenceChanged = wasOnline;
        }

        await context.SaveChangesAsync(cancellationToken);
        if (shouldPublishPresenceChanged)
        {
            await PublishUserPresenceChangedAsync(cancellationToken);
        }
        return TypedResults.Ok(new { message = "Student active status updated successfully." });
    }

    [HttpPost("activity/heartbeat")]
    public async Task<IResult> Heartbeat(
        [FromHeader(Name = "X-User-Id")] string? userIdStr,
        CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(userIdStr, out var userId))
            return TypedResults.Unauthorized();

        var user = await context.Users.FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);
        if (user is null)
            return TypedResults.NotFound();

        if (!user.IsActive)
        {
            var wasOnline = user.IsOnline;
            user.IsOnline = false;
            await context.SaveChangesAsync(cancellationToken);
            if (wasOnline)
            {
                await PublishUserPresenceChangedAsync(cancellationToken);
            }
            return TypedResults.Forbid();
        }

        var wasPreviouslyOnline = user.IsOnline;
        user.LastSeenAt = DateTime.UtcNow;
        user.IsOnline = true;
        user.UpdatedAt = DateTime.UtcNow;

        await context.SaveChangesAsync(cancellationToken);
        if (!wasPreviouslyOnline)
        {
            await PublishUserPresenceChangedAsync(cancellationToken);
        }
        return TypedResults.Ok(new { message = "Heartbeat updated." });
    }

    [HttpPost("activity/offline")]
    public async Task<IResult> MarkOffline(
        [FromHeader(Name = "X-User-Id")] string? userIdStr,
        [FromQuery] string? userId,
        CancellationToken cancellationToken)
    {
        var rawUserId = !string.IsNullOrWhiteSpace(userIdStr) ? userIdStr : userId;
        if (!Guid.TryParse(rawUserId, out var parsedUserId))
            return TypedResults.Ok();

        var user = await context.Users.FirstOrDefaultAsync(u => u.Id == parsedUserId, cancellationToken);
        if (user is null)
            return TypedResults.Ok();

        var wasOnline = user.IsOnline;
        user.LastSeenAt = DateTime.UtcNow;
        user.IsOnline = false;
        user.UpdatedAt = DateTime.UtcNow;
        await context.SaveChangesAsync(cancellationToken);
        if (wasOnline)
        {
            await PublishUserPresenceChangedAsync(cancellationToken);
        }

        return TypedResults.Ok(new { message = "User marked offline." });
    }

    [HttpDelete]
    public async Task<IResult> DeleteAccount(
        [FromHeader(Name = "X-User-Id")] string? userIdStr,
        CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(userIdStr, out var userId)) 
            return TypedResults.Unauthorized();

        var user = await context.Users.FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);
        if (user is null) return TypedResults.NotFound();

        context.Users.Remove(user);
        await context.SaveChangesAsync(cancellationToken);

        return TypedResults.Ok(new { message = "Tài khoản của bạn đã được xóa thành công." });
    }

    private static string HashPassword(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(16);
        var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, 100_000, HashAlgorithmName.SHA256, 32);
        return $"{Convert.ToBase64String(salt)}.{Convert.ToBase64String(hash)}";
    }

    private static bool VerifyPassword(string password, string storedHash)
    {
        var parts = storedHash.Split('.');
        if (parts.Length != 2) return false;

        var salt = Convert.FromBase64String(parts[0]);
        var hash = Convert.FromBase64String(parts[1]);
        var computedHash = Rfc2898DeriveBytes.Pbkdf2(password, salt, 100_000, HashAlgorithmName.SHA256, 32);

        return CryptographicOperations.FixedTimeEquals(hash, computedHash);
    }

    private Task PublishUserPresenceChangedAsync(CancellationToken cancellationToken) =>
        realtimeDispatcher.PublishAsync(RealtimeEventTypes.UsersPresenceChanged, cancellationToken: cancellationToken);
}
