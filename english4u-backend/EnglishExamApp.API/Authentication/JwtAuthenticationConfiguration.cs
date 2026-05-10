using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace EnglishExamApp.API.Authentication;

internal static class JwtAuthenticationConfiguration
{
    public static TokenValidationParameters CreateTokenValidationParameters(
        IConfiguration configuration,
        string jwtKey) =>
        new()
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = configuration["Jwt:Issuer"],
            ValidAudience = configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            NameClaimType = ClaimTypes.NameIdentifier,
            RoleClaimType = ClaimTypes.Role
        };
}
