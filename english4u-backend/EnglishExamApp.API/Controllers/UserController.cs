using EnglishExamApp.Application.Interfaces;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;

namespace EnglishExamApp.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class UserController(IApplicationDbContext context) : ControllerBase
{
    public sealed record UpdateProfileRequest(
        string DisplayName, 
        string? AvatarUrl, 
        string? Bio, 
        string? Phone, 
        string? Department, 
        string? Position, 
        string? Notes);
    public sealed record ChangePasswordRequest(string OldPassword, string NewPassword);

    [HttpGet("profile")]
    public async Task<IResult> GetProfile([FromHeader(Name = "X-User-Id")] string? userIdStr, CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(userIdStr, out var userId)) 
            return TypedResults.Unauthorized();

        var user = await context.Users
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
                u.LastLoginAt,
                Role = u.UserRoles.FirstOrDefault()!.Role.Name,
                u.CreatedAt
            })
            .FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);

        return user is null ? TypedResults.NotFound() : TypedResults.Ok(user);
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
}
