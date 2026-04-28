using EnglishExamApp.API.Realtime;
using EnglishExamApp.Application.DTOs.Users;
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
            .Where(u => u.Id == userId)
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
                Role = u.UserRoles.Select(userRole => userRole.Role.Name).FirstOrDefault(),
                u.CreatedAt,
                u.ExperiencePoints,
                u.DailyStreakCount,
                u.LongestStreakCount,
                u.LastActivityAt
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (rawProfile is null)
            return TypedResults.NotFound();

        var completedSessions = await context.ExamSessions
            .AsNoTracking()
            .Where(session =>
                session.UserId == userId
                && (session.Status == "Completed" || session.Status == "Scored"))
            .Select(session => new
            {
                session.Id,
                session.ExamId,
                ExamTitle = session.Exam.Title,
                SkillType = session.Exam.ExamSections
                    .OrderBy(section => section.OrderIndex)
                    .Select(section => section.SkillType)
                    .FirstOrDefault() ?? "PRACTICE",
                CompletedAt = session.EndedAt ?? session.StartedAt,
                LatestBandScore = session.ScoringResults
                    .OrderByDescending(result => result.ScoredAt)
                    .Select(result => result.TotalBandScore)
                    .FirstOrDefault(),
                session.StartedAt,
                session.EndedAt
            })
            .OrderByDescending(session => session.CompletedAt)
            .ToListAsync(cancellationToken);

        var completedSessionCount = completedSessions.Count;
        var uniqueExamCompletedCount = completedSessions
            .Select(session => session.ExamId)
            .Distinct()
            .Count();
        var scoredBandValues = completedSessions
            .Where(session => session.LatestBandScore.HasValue)
            .Select(session => session.LatestBandScore!.Value)
            .ToList();
        double? averageBandScore = scoredBandValues.Count > 0
            ? Math.Round(scoredBandValues.Average(), 1)
            : null;
        double? bestBandScore = scoredBandValues.Count > 0
            ? Math.Round(scoredBandValues.Max(), 1)
            : null;
        var totalPracticeMinutes = completedSessions.Sum(session =>
        {
            if (session.EndedAt is null)
            {
                return 0;
            }

            var duration = session.EndedAt.Value - session.StartedAt;
            return Math.Max(1, (int)Math.Ceiling(duration.TotalMinutes));
        });

        var gamificationProgress = UserGamificationCalculator.BuildProgress(rawProfile.ExperiencePoints);
        var gamification = new UserGamificationDto(
            gamificationProgress.ExperiencePoints,
            gamificationProgress.CurrentLevel,
            gamificationProgress.CurrentLevelStartExperience,
            gamificationProgress.NextLevelExperience,
            gamificationProgress.ExperienceToNextLevel,
            gamificationProgress.LevelProgressPercent,
            rawProfile.DailyStreakCount,
            rawProfile.LongestStreakCount,
            VietnamDateTimeFormatter.ToDisplay(rawProfile.LastActivityAt));
        var learning = new UserLearningSnapshotDto(
            completedSessionCount,
            uniqueExamCompletedCount,
            averageBandScore,
            bestBandScore,
            totalPracticeMinutes);
        var recentExamActivities = completedSessions
            .Take(5)
            .Select(session => new UserProfileRecentExamDto(
                session.Id,
                session.ExamId,
                session.ExamTitle,
                session.SkillType,
                VietnamDateTimeFormatter.ToDisplay(session.CompletedAt)!,
                session.LatestBandScore.HasValue
                    ? Math.Round(session.LatestBandScore.Value, 1)
                    : null))
            .ToList();

        var profile = new UserProfileDto(
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
            VietnamDateTimeFormatter.ToDisplay(rawProfile.LastSeenAt),
            VietnamDateTimeFormatter.ToDisplay(rawProfile.LastLoginAt),
            rawProfile.Role,
            VietnamDateTimeFormatter.ToDisplay(rawProfile.CreatedAt)!,
            gamification,
            learning,
            recentExamActivities);

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
