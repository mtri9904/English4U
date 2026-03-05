using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using EnglishExamApp.Application.Interfaces;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace EnglishExamApp.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController(IApplicationDbContext context, IConfiguration configuration) : ControllerBase
{
    public sealed record LoginRequest(string Email, string Password);

    public sealed record RegisterRequest(string Email, string Password, string? DisplayName);

    public sealed record AuthResponseDto(
        string Token,
        string UserId,
        string Email,
        string? DisplayName,
        string Role);

    public sealed record GoogleLoginRequest(string IdToken);

    [HttpPost("google")]
    public async Task<IResult> GoogleLogin([FromBody] GoogleLoginRequest request, CancellationToken cancellationToken)
    {
        Google.Apis.Auth.GoogleJsonWebSignature.Payload payload;
        try
        {
            var settings = new Google.Apis.Auth.GoogleJsonWebSignature.ValidationSettings
            {
                Audience = [configuration["Google:ClientId"]!]
            };
            payload = await Google.Apis.Auth.GoogleJsonWebSignature.ValidateAsync(request.IdToken, settings);
        }
        catch
        {
            return TypedResults.Unauthorized();
        }

        var user = await context.Users
            .Include(u => u.UserRoles)
                .ThenInclude(ur => ur.Role)
            .FirstOrDefaultAsync(u => u.Email == payload.Email, cancellationToken);

        if (user is null)
        {
            var studentRole = await context.Roles.FirstOrDefaultAsync(r => r.Name == "Student", cancellationToken);
            if (studentRole is null)
            {
                studentRole = new Domain.Entities.Role { Id = Guid.NewGuid(), Name = "Student" };
                context.Roles.Add(studentRole);
            }

            user = new Domain.Entities.User
            {
                Id = Guid.NewGuid(),
                Email = payload.Email,
                PasswordHash = string.Empty,
                DisplayName = payload.Name ?? payload.Email.Split('@')[0],
                AvatarUrl = payload.Picture,
                Provider = "google",
                IsActive = true,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            context.Users.Add(user);
            context.UserRoles.Add(new Domain.Entities.UserRole
            {
                UserId = user.Id,
                RoleId = studentRole.Id
            });
        }

        user.LastLoginAt = DateTime.UtcNow;
        if (string.IsNullOrEmpty(user.AvatarUrl) && !string.IsNullOrEmpty(payload.Picture))
            user.AvatarUrl = payload.Picture;

        await context.SaveChangesAsync(cancellationToken);

        var roleName = user.UserRoles.FirstOrDefault()?.Role.Name ?? "Student";
        var token = GenerateJwtToken(user.Id.ToString(), user.Email, roleName);

        return TypedResults.Ok(new AuthResponseDto(
            Token: token,
            UserId: user.Id.ToString(),
            Email: user.Email,
            DisplayName: user.DisplayName,
            Role: roleName));
    }

    [HttpPost("register")]
    public async Task<IResult> Register([FromBody] RegisterRequest request, CancellationToken cancellationToken)
    {
        var emailExists = await context.Users.AnyAsync(u => u.Email == request.Email, cancellationToken);
        if (emailExists)
            return TypedResults.Conflict(new { message = "Email đã được sử dụng." });

        var studentRole = await context.Roles.FirstOrDefaultAsync(r => r.Name == "Student", cancellationToken);
        if (studentRole is null)
        {
            studentRole = new Domain.Entities.Role { Id = Guid.NewGuid(), Name = "Student" };
            context.Roles.Add(studentRole);
        }

        var user = new Domain.Entities.User
        {
            Id = Guid.NewGuid(),
            Email = request.Email,
            PasswordHash = HashPassword(request.Password),
            DisplayName = request.DisplayName ?? request.Email.Split('@')[0],
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        context.Users.Add(user);
        context.UserRoles.Add(new Domain.Entities.UserRole
        {
            UserId = user.Id,
            RoleId = studentRole.Id
        });

        await context.SaveChangesAsync(cancellationToken);

        var token = GenerateJwtToken(user.Id.ToString(), user.Email, "Student");

        return TypedResults.Created($"/api/auth/{user.Id}", new AuthResponseDto(
            Token: token,
            UserId: user.Id.ToString(),
            Email: user.Email,
            DisplayName: user.DisplayName,
            Role: "Student"));
    }

    [HttpPost("login")]
    public async Task<IResult> Login([FromBody] LoginRequest request, CancellationToken cancellationToken)
    {
        var user = await context.Users
            .Include(u => u.UserRoles)
                .ThenInclude(ur => ur.Role)
            .FirstOrDefaultAsync(u => u.Email == request.Email, cancellationToken);

        if (user is null || !VerifyPassword(request.Password, user.PasswordHash))
            return TypedResults.Unauthorized();

        if (user.Provider == "google")
            return TypedResults.BadRequest(new { message = "Tài khoản này sử dụng đăng nhập Google. Vui lòng dùng nút 'Đăng nhập bằng Google'." });

        var roleName = user.UserRoles.FirstOrDefault()?.Role.Name ?? "Student";

        user.LastLoginAt = DateTime.UtcNow;
        await context.SaveChangesAsync(cancellationToken);

        var token = GenerateJwtToken(user.Id.ToString(), user.Email, roleName);

        return TypedResults.Ok(new AuthResponseDto(
            Token: token,
            UserId: user.Id.ToString(),
            Email: user.Email,
            DisplayName: user.DisplayName,
            Role: roleName));
    }

    [HttpPost("seed-admin")]
    public async Task<IResult> SeedAdmin(CancellationToken cancellationToken)
    {
        var exists = await context.Users.AnyAsync(u => u.Email == "admin@english4u.com", cancellationToken);
        if (exists)
            return TypedResults.Conflict(new { message = "Admin already exists." });

        var adminRole = await context.Roles.FirstOrDefaultAsync(r => r.Name == "Admin", cancellationToken);
        if (adminRole is null)
        {
            adminRole = new Domain.Entities.Role { Id = Guid.NewGuid(), Name = "Admin" };
            context.Roles.Add(adminRole);
        }

        var studentRole = await context.Roles.FirstOrDefaultAsync(r => r.Name == "Student", cancellationToken);
        if (studentRole is null)
        {
            studentRole = new Domain.Entities.Role { Id = Guid.NewGuid(), Name = "Student" };
            context.Roles.Add(studentRole);
        }

        var adminUser = new Domain.Entities.User
        {
            Id = Guid.NewGuid(),
            Email = "admin@english4u.com",
            PasswordHash = HashPassword("Admin@123"),
            DisplayName = "System Admin",
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        context.Users.Add(adminUser);
        context.UserRoles.Add(new Domain.Entities.UserRole
        {
            UserId = adminUser.Id,
            RoleId = adminRole.Id
        });

        await context.SaveChangesAsync(cancellationToken);

        return TypedResults.Ok(new { message = "Admin seeded.", email = "admin@english4u.com", password = "Admin@123" });
    }

    private string GenerateJwtToken(string userId, string email, string role)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(configuration["Jwt:Key"]!));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, userId),
            new Claim(JwtRegisteredClaimNames.Email, email),
            new Claim(ClaimTypes.Role, role),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        var expireMinutes = int.Parse(configuration["Jwt:ExpireMinutes"] ?? "1440");

        var token = new JwtSecurityToken(
            issuer: configuration["Jwt:Issuer"],
            audience: configuration["Jwt:Audience"],
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(expireMinutes),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
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
