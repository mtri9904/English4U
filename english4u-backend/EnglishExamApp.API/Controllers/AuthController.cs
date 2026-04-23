using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using EnglishExamApp.API.Realtime;
using EnglishExamApp.Application.Interfaces;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace EnglishExamApp.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController(
    IApplicationDbContext context,
    IConfiguration configuration,
    IEmailService emailService,
    IRealtimeEventDispatcher realtimeDispatcher) : ControllerBase
{
    public sealed record ForgotPasswordRequest(string Email);
    public sealed record ResetPasswordRequest(string Token, string NewPassword);

    public sealed record LoginRequest(string Email, string Password);

    public sealed record RegisterRequest(string Email, string Password, string? DisplayName);
    public sealed record VerifyOtpRequest(string Email, string Otp);

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
                IsEmailConfirmed = true,
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

        if (!user.IsActive)
            return TypedResults.BadRequest(new { message = "Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên." });

        user.LastLoginAt = DateTime.UtcNow;
        user.LastSeenAt = DateTime.UtcNow;
        user.IsOnline = true;
        if (string.IsNullOrEmpty(user.AvatarUrl) && !string.IsNullOrEmpty(payload.Picture))
            user.AvatarUrl = payload.Picture;

        await context.SaveChangesAsync(cancellationToken);
        await PublishUserPresenceChangedAsync(cancellationToken);

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

        // Generate 4-digit OTP
        var otp = RandomNumberGenerator.GetInt32(1000, 9999).ToString();
        var user = new Domain.Entities.User
        {
            Id = Guid.NewGuid(),
            Email = request.Email,
            PasswordHash = HashPassword(request.Password),
            DisplayName = request.DisplayName ?? request.Email.Split('@')[0],
            IsActive = true,
            IsEmailConfirmed = false,
            ActivationToken = otp,
            TokenExpiry = DateTime.UtcNow.AddMinutes(1), // OTP expires in 1 mins
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

        try
        {
            // Send Activation Email with OTP
            var emailBody = $@"
                <div style='font-family: Arial, sans-serif; padding: 20px; text-align: center; border: 1px solid #eee; border-radius: 10px;'>
                    <h2 style='color: #137dc5;'>Chào mừng bạn đến với English4U!</h2>
                    <p>Mã xác thực của bạn là:</p>
                    <div style='font-size: 32px; font-weight: bold; letter-spacing: 10px; padding: 20px; background: #f4f4f4; border-radius: 5px; display: inline-block; margin: 10px 0;'>
                        {otp}
                    </div>
                    <p>Mã này sẽ hết hạn sau 1 phút.</p>
                    <p>Vui lòng không chia sẻ mã này với bất kỳ ai.</p>
                </div>";

            await emailService.SendEmailAsync(user.Email, "Mã xác thực tài khoản English4U", emailBody);
            return TypedResults.Ok(new { message = "Đã gửi mã xác nhận vào email của bạn. Vui lòng kiểm tra." });
        }
        catch (Exception ex)
        {
            // If email fails, we should probably remove the user so they can try again with fixed settings
            context.Users.Remove(user);
            await context.SaveChangesAsync(cancellationToken);
            
            return TypedResults.BadRequest(new { 
                message = "Không thể gửi email kích hoạt. Vui lòng kiểm tra lại cấu hình Email của hệ thống.",
                error = ex.Message 
            });
        }
    }

    [HttpPost("verify-otp")]
    public async Task<IResult> VerifyOtp([FromBody] VerifyOtpRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(request.Email) || string.IsNullOrEmpty(request.Otp))
            return TypedResults.BadRequest(new { message = "Email và mã OTP không được để trống." });

        var user = await context.Users.FirstOrDefaultAsync(u => u.Email == request.Email && u.ActivationToken == request.Otp, cancellationToken);
        
        if (user is null)
        {
            return TypedResults.BadRequest(new { message = "Mã xác thực không đúng hoặc đã hết hạn." });
        }

        if (user.TokenExpiry < DateTime.UtcNow)
            return TypedResults.BadRequest(new { message = "Mã xác thực đã hết hạn. Vui lòng đăng ký lại." });

        if (user.IsEmailConfirmed)
            return TypedResults.Ok(new { message = "Tài khoản của bạn đã được kích hoạt trước đó." });

        user.IsEmailConfirmed = true;
        user.ActivationToken = null;
        user.TokenExpiry = null;
        user.UpdatedAt = DateTime.UtcNow;

        await context.SaveChangesAsync(cancellationToken);

        return TypedResults.Ok(new { message = "Kích hoạt tài khoản thành công! Bạn có thể đăng nhập ngay bây giờ." });
    }

    [HttpPost("forgot-password")]
    public async Task<IResult> ForgotPassword([FromBody] ForgotPasswordRequest request, CancellationToken cancellationToken)
    {
        var user = await context.Users.FirstOrDefaultAsync(u => u.Email == request.Email, cancellationToken);
        if (user is null)
            return TypedResults.Ok(new { message = "Nếu email tồn tại trong hệ thống, bạn sẽ sớm nhận được link reset mật khẩu." });

        var resetToken = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        user.ResetPasswordToken = resetToken;
        user.TokenExpiry = DateTime.UtcNow.AddHours(1);
        await context.SaveChangesAsync(cancellationToken);

        var frontendUrl = configuration["FrontendUrl"] ?? "http://localhost:5173";
        var resetLink = $"{frontendUrl}/reset-password?token={resetToken}";
        var emailBody = $@"
            <div style='font-family: Arial, sans-serif; padding: 20px;'>
                <h2>Yêu cầu đặt lại mật khẩu</h2>
                <p>Bạn đã yêu cầu đặt lại mật khẩu. Click vào link bên dưới để tiếp tục:</p>
                <a href='{resetLink}' style='padding: 10px 20px; background: #137dc5; color: white; text-decoration: none; border-radius: 5px;'>Đặt lại mật khẩu</a>
                <p>Link này sẽ hết hạn sau 1 giờ.</p>
            </div>";

        await emailService.SendEmailAsync(user.Email, "Đặt lại mật khẩu English4U", emailBody);

        return TypedResults.Ok(new { message = "Link reset mật khẩu đã được gửi vào email của bạn." });
    }

    [HttpPost("reset-password")]
    public async Task<IResult> ResetPassword([FromBody] ResetPasswordRequest request, CancellationToken cancellationToken)
    {
        var user = await context.Users.FirstOrDefaultAsync(u => u.ResetPasswordToken == request.Token, cancellationToken);
        if (user is null || user.TokenExpiry < DateTime.UtcNow)
            return TypedResults.BadRequest(new { message = "Token không hợp lệ hoặc đã hết hạn." });

        user.PasswordHash = HashPassword(request.NewPassword);
        user.ResetPasswordToken = null;
        user.TokenExpiry = null;
        user.UpdatedAt = DateTime.UtcNow;
        
        await context.SaveChangesAsync(cancellationToken);

        return TypedResults.Ok(new { message = "Đã đặt lại mật khẩu thành công!" });
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

        if (!user.IsActive)
            return TypedResults.BadRequest(new { message = "Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên." });

        if (user.Provider == "local" && !user.IsEmailConfirmed)
            return TypedResults.BadRequest(new { message = "Vui lòng kích hoạt tài khoản qua email trước khi đăng nhập." });

        if (user.Provider == "google")
            return TypedResults.BadRequest(new { message = "Tài khoản này sử dụng đăng nhập Google. Vui lòng dùng nút 'Đăng nhập bằng Google'." });

        var roleName = user.UserRoles.FirstOrDefault()?.Role.Name ?? "Student";

        user.LastLoginAt = DateTime.UtcNow;
        user.LastSeenAt = DateTime.UtcNow;
        user.IsOnline = true;
        await context.SaveChangesAsync(cancellationToken);
        await PublishUserPresenceChangedAsync(cancellationToken);

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

        // Ensure roles exist
        var roles = new[] { "Admin", "Student", "Teacher", "ContentCreator" };
        foreach (var roleName in roles)
        {
            if (!await context.Roles.AnyAsync(r => r.Name == roleName, cancellationToken))
            {
                context.Roles.Add(new Domain.Entities.Role { Id = Guid.NewGuid(), Name = roleName });
            }
        }
        await context.SaveChangesAsync(cancellationToken);

        var adminRole = await context.Roles.FirstAsync(r => r.Name == "Admin", cancellationToken);
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

        return TypedResults.Ok(new { message = "Seeding successful. Added Admin, Student, Teacher, and ContentCreator roles." });
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

    private Task PublishUserPresenceChangedAsync(CancellationToken cancellationToken) =>
        realtimeDispatcher.PublishAsync(RealtimeEventTypes.UsersPresenceChanged, cancellationToken: cancellationToken);
}
