using EnglishExamApp.API.Authentication;
using EnglishExamApp.Application.DTOs.Users;
using EnglishExamApp.Application.Interfaces;
using EnglishExamApp.Application.Utilities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EnglishExamApp.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class UserController(
    IApplicationDbContext context,
    ICurrentUserService currentUser,
    IPasswordHasher passwordHasher,
    IUserPresenceService userPresenceService) : ControllerBase
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
    public async Task<IResult> GetProfile(CancellationToken cancellationToken)
    {
        if (!currentUser.TryGetUserId(out var userId))
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
        [FromBody] UpdateProfileRequest request,
        CancellationToken cancellationToken)
    {
        if (!currentUser.TryGetUserId(out var userId))
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
        [FromBody] ChangePasswordRequest request,
        CancellationToken cancellationToken)
    {
        if (!currentUser.TryGetUserId(out var userId))
            return TypedResults.Unauthorized();

        var user = await context.Users.FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);
        if (user is null) return TypedResults.NotFound();

        if (!passwordHasher.VerifyPassword(request.OldPassword, user.PasswordHash))
            return TypedResults.BadRequest(new { message = "Mật khẩu cũ không chính xác" });

        user.PasswordHash = passwordHasher.HashPassword(request.NewPassword);
        user.UpdatedAt = DateTime.UtcNow;

        await context.SaveChangesAsync(cancellationToken);
        return TypedResults.Ok(new { message = "Password updated successfully" });
    }

    [HttpGet("students")]
    [Authorize(Roles = "Admin")]
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
    [Authorize(Roles = "Admin")]
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
            await userPresenceService.PublishPresenceChangedAsync(cancellationToken);
        }
        return TypedResults.Ok(new { message = "Student active status updated successfully." });
    }

    [HttpPost("activity/heartbeat")]
    public async Task<IResult> Heartbeat(CancellationToken cancellationToken)
    {
        if (!currentUser.TryGetUserId(out var userId))
            return TypedResults.Unauthorized();

        var result = await userPresenceService.HeartbeatAsync(userId, cancellationToken);
        if (result.Status == UserPresenceHeartbeatStatus.NotFound)
        {
            return TypedResults.NotFound();
        }

        if (result.Status == UserPresenceHeartbeatStatus.Inactive)
        {
            return TypedResults.Forbid();
        }

        return TypedResults.Ok(new { message = "Heartbeat updated." });
    }

    [HttpPost("activity/offline")]
    public async Task<IResult> MarkOffline(CancellationToken cancellationToken)
    {
        if (!currentUser.TryGetUserId(out var userId))
            return TypedResults.Unauthorized();

        var userFound = await userPresenceService.MarkOfflineAsync(userId, cancellationToken);
        if (!userFound)
            return TypedResults.Ok();

        return TypedResults.Ok(new { message = "User marked offline." });
    }

    [HttpDelete]
    public async Task<IResult> DeleteAccount(CancellationToken cancellationToken)
    {
        if (!currentUser.TryGetUserId(out var userId))
            return TypedResults.Unauthorized();

        var user = await context.Users.FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);
        if (user is null) return TypedResults.NotFound();

        context.Users.Remove(user);
        await context.SaveChangesAsync(cancellationToken);

        return TypedResults.Ok(new { message = "Tài khoản của bạn đã được xóa thành công." });
    }
}
