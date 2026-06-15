using EnglishExamApp.API.Authentication;
using EnglishExamApp.Application.Interfaces;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EnglishExamApp.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController(
    IApplicationDbContext context,
    IConfiguration configuration,
    IEmailService emailService,
    IWebHostEnvironment environment,
    IPasswordHasher passwordHasher,
    IJwtTokenService jwtTokenService,
    IAuthCodeGenerator authCodeGenerator,
    IUserPresenceService userPresenceService) : ControllerBase
{
    public sealed record ForgotPasswordRequest(string Email);
    public sealed record ResetPasswordRequest(string Token, string NewPassword);

    public sealed record LoginRequest(string Email, string Password);

    public sealed record RegisterRequest(string Email, string Password, string? DisplayName);
    public sealed record VerifyOtpRequest(string Email, string Otp);

    public sealed record AuthResponseDto(
        string Token,
        string RefreshToken,
        string UserId,
        string Email,
        string? DisplayName,
        string Role);

    public sealed record GoogleLoginRequest(string IdToken);
    public sealed record RefreshRequest(string RefreshToken);

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
            var studentRole = await GetOrCreateRoleAsync(AuthRoles.Student, cancellationToken);

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

        if (string.IsNullOrEmpty(user.AvatarUrl) && !string.IsNullOrEmpty(payload.Picture))
            user.AvatarUrl = payload.Picture;

        await userPresenceService.MarkLoggedInAsync(user, cancellationToken);

        var roleName = ResolvePrimaryRoleName(user);
        return TypedResults.Ok(await BuildAuthResponseAsync(user, roleName, cancellationToken));
    }

    [HttpPost("register")]
    public async Task<IResult> Register([FromBody] RegisterRequest request, CancellationToken cancellationToken)
    {
        var emailExists = await context.Users.AnyAsync(u => u.Email == request.Email, cancellationToken);
        if (emailExists)
            return TypedResults.Conflict(new { message = "Email đã được sử dụng." });

        var studentRole = await GetOrCreateRoleAsync(AuthRoles.Student, cancellationToken);

        var otp = authCodeGenerator.GenerateOtpCode();
        var user = new Domain.Entities.User
        {
            Id = Guid.NewGuid(),
            Email = request.Email,
            PasswordHash = passwordHasher.HashPassword(request.Password),
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
            var emailBody = AuthEmailTemplates.BuildActivationOtpEmail(otp);
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

        var resetToken = authCodeGenerator.GeneratePasswordResetToken();
        user.ResetPasswordToken = resetToken;
        user.TokenExpiry = DateTime.UtcNow.AddHours(1);
        await context.SaveChangesAsync(cancellationToken);

        var frontendUrl = configuration["FrontendUrl"] ?? "http://localhost:5173";
        var resetLink = $"{frontendUrl}/reset-password?token={resetToken}";
        var emailBody = AuthEmailTemplates.BuildResetPasswordEmail(resetLink);

        await emailService.SendEmailAsync(user.Email, "Đặt lại mật khẩu English4U", emailBody);

        return TypedResults.Ok(new { message = "Link reset mật khẩu đã được gửi vào email của bạn." });
    }

    [HttpPost("reset-password")]
    public async Task<IResult> ResetPassword([FromBody] ResetPasswordRequest request, CancellationToken cancellationToken)
    {
        var user = await context.Users.FirstOrDefaultAsync(u => u.ResetPasswordToken == request.Token, cancellationToken);
        if (user is null || user.TokenExpiry < DateTime.UtcNow)
            return TypedResults.BadRequest(new { message = "Token không hợp lệ hoặc đã hết hạn." });

        user.PasswordHash = passwordHasher.HashPassword(request.NewPassword);
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

        if (user is null || !passwordHasher.VerifyPassword(request.Password, user.PasswordHash))
            return TypedResults.Unauthorized();

        if (!user.IsActive)
            return TypedResults.BadRequest(new { message = "Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên." });

        if (user.Provider == "local" && !user.IsEmailConfirmed)
            return TypedResults.BadRequest(new { message = "Vui lòng kích hoạt tài khoản qua email trước khi đăng nhập." });

        if (user.Provider == "google")
            return TypedResults.BadRequest(new { message = "Tài khoản này sử dụng đăng nhập Google. Vui lòng dùng nút 'Đăng nhập bằng Google'." });

        var roleName = ResolvePrimaryRoleName(user);

        await userPresenceService.MarkLoggedInAsync(user, cancellationToken);

        return TypedResults.Ok(await BuildAuthResponseAsync(user, roleName, cancellationToken));
    }

    [HttpPost("seed-admin")]
    public async Task<IResult> SeedAdmin(CancellationToken cancellationToken)
    {
        if (!environment.IsDevelopment())
        {
            return TypedResults.NotFound();
        }

        var exists = await context.Users.AnyAsync(u => u.Email == "admin@english4u.com", cancellationToken);
        if (exists)
            return TypedResults.Conflict(new { message = "Admin already exists." });

        foreach (var roleName in AuthRoles.SeedRoles)
        {
            await GetOrCreateRoleAsync(roleName, cancellationToken);
        }
        await context.SaveChangesAsync(cancellationToken);

        var adminRole = await context.Roles.FirstAsync(r => r.Name == AuthRoles.Admin, cancellationToken);
        var seedAdminPassword = configuration["SeedAdmin:Password"];
        if (string.IsNullOrWhiteSpace(seedAdminPassword))
        {
            return TypedResults.Problem(
                "SeedAdmin:Password is not configured.",
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        var adminUser = new Domain.Entities.User
        {
            Id = Guid.NewGuid(),
            Email = "admin@english4u.com",
            PasswordHash = passwordHasher.HashPassword(seedAdminPassword),
            DisplayName = "System Admin",
            IsActive = true,
            IsEmailConfirmed = true,
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

    [HttpPost("refresh")]
    public async Task<IResult> Refresh([FromBody] RefreshRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.RefreshToken))
            return TypedResults.BadRequest(new { message = "Refresh token không hợp lệ." });

        var user = await context.Users
            .Include(u => u.UserRoles)
                .ThenInclude(ur => ur.Role)
            .FirstOrDefaultAsync(u => u.RefreshToken == request.RefreshToken, cancellationToken);

        if (user is null)
            return TypedResults.Unauthorized();

        if (user.RefreshTokenExpiry is null || user.RefreshTokenExpiry < DateTime.UtcNow)
            return TypedResults.Unauthorized();

        if (!user.IsActive)
            return TypedResults.BadRequest(new { message = "Tài khoản đã bị khóa." });

        var roleName = ResolvePrimaryRoleName(user);
        return TypedResults.Ok(await BuildAuthResponseAsync(user, roleName, cancellationToken));
    }

    [HttpPost("revoke")]
    [Microsoft.AspNetCore.Authorization.Authorize]
    public async Task<IResult> Revoke(CancellationToken cancellationToken)
    {
        var userIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
                       ?? User.FindFirst("sub")?.Value;

        if (!Guid.TryParse(userIdClaim, out var userId))
            return TypedResults.Unauthorized();

        var user = await context.Users.FindAsync([userId], cancellationToken);
        if (user is null)
            return TypedResults.NotFound();

        user.RefreshToken = null;
        user.RefreshTokenExpiry = null;
        user.UpdatedAt = DateTime.UtcNow;
        await context.SaveChangesAsync(cancellationToken);

        return TypedResults.Ok(new { message = "Đã đăng xuất thành công." });
    }

    private async Task<AuthResponseDto> BuildAuthResponseAsync(
        Domain.Entities.User user,
        string roleName,
        CancellationToken cancellationToken)
    {
        var accessToken = jwtTokenService.GenerateToken(user.Id, user.Email, roleName);
        var refreshToken = jwtTokenService.GenerateRefreshToken();
        var refreshExpireDays = int.TryParse(configuration["Jwt:RefreshTokenExpireDays"], out var d) ? d : 30;

        user.RefreshToken = refreshToken;
        user.RefreshTokenExpiry = DateTime.UtcNow.AddDays(refreshExpireDays);
        user.UpdatedAt = DateTime.UtcNow;
        await context.SaveChangesAsync(cancellationToken);

        return new AuthResponseDto(
            Token: accessToken,
            RefreshToken: refreshToken,
            UserId: user.Id.ToString(),
            Email: user.Email,
            DisplayName: user.DisplayName,
            Role: roleName);
    }

    private AuthResponseDto BuildAuthResponse(Domain.Entities.User user, string roleName)
    {
        var token = jwtTokenService.GenerateToken(user.Id, user.Email, roleName);

        return new AuthResponseDto(
            Token: token,
            RefreshToken: string.Empty,
            UserId: user.Id.ToString(),
            Email: user.Email,
            DisplayName: user.DisplayName,
            Role: roleName);
    }

    private async Task<Domain.Entities.Role> GetOrCreateRoleAsync(
        string roleName,
        CancellationToken cancellationToken)
    {
        var role = await context.Roles.FirstOrDefaultAsync(r => r.Name == roleName, cancellationToken);
        if (role is not null)
        {
            return role;
        }

        role = new Domain.Entities.Role
        {
            Id = Guid.NewGuid(),
            Name = roleName
        };
        context.Roles.Add(role);

        return role;
    }

    private static string ResolvePrimaryRoleName(Domain.Entities.User user) =>
        user.UserRoles.FirstOrDefault()?.Role.Name ?? AuthRoles.Student;
}
