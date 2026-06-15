using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;

namespace EnglishExamApp.API.Authentication;

public sealed class CurrentUserService(IHttpContextAccessor httpContextAccessor) : ICurrentUserService
{
    private ClaimsPrincipal? User => httpContextAccessor.HttpContext?.User;

    public bool IsAuthenticated => User?.Identity?.IsAuthenticated == true;

    public Guid? UserId
    {
        get
        {
            var rawUserId =
                User?.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? User?.FindFirstValue(JwtRegisteredClaimNames.Sub)
                ?? User?.FindFirstValue("sub");

            return Guid.TryParse(rawUserId, out var userId)
                ? userId
                : null;
        }
    }

    public string? Role => User?.FindFirstValue(ClaimTypes.Role);

    public bool TryGetUserId(out Guid userId)
    {
        var currentUserId = UserId;
        if (currentUserId.HasValue)
        {
            userId = currentUserId.Value;
            return true;
        }

        userId = Guid.Empty;
        return false;
    }
}
