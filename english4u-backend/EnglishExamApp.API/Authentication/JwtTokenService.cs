using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace EnglishExamApp.API.Authentication;

public sealed class JwtTokenService(IConfiguration configuration) : IJwtTokenService
{
    public string GenerateToken(Guid userId, string email, string role)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(RequireConfiguration("Jwt:Key")));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var userIdText = userId.ToString();

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, userIdText),
            new Claim(JwtRegisteredClaimNames.Sub, userIdText),
            new Claim(JwtRegisteredClaimNames.Email, email),
            new Claim(ClaimTypes.Role, role),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        var expireMinutes = int.TryParse(configuration["Jwt:ExpireMinutes"], out var configuredExpireMinutes)
            ? configuredExpireMinutes
            : 1440;

        var token = new JwtSecurityToken(
            issuer: configuration["Jwt:Issuer"],
            audience: configuration["Jwt:Audience"],
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(expireMinutes),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private string RequireConfiguration(string key)
    {
        var value = configuration[key];
        if (!string.IsNullOrWhiteSpace(value))
        {
            return value;
        }

        throw new InvalidOperationException(
            $"Missing required configuration '{key}'. Set it with environment variable '{key.Replace(":", "__")}' or user-secrets key '{key}'.");
    }
}
