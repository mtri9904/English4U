using System.Security.Claims;
using EnglishLearningApp.Application.Users.Queries.GetProfile;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EnglishLearningApp.API.Controllers;

[ApiController]
[Route("api/users")]
[Authorize]
public class UsersController(IMediator mediator) : ControllerBase
{
    [HttpGet("me")]
    public async Task<IActionResult> GetProfile()
    {
        var sub = User.FindFirstValue(ClaimTypes.NameIdentifier)
               ?? User.FindFirstValue("sub");

        if (!Guid.TryParse(sub, out var userId))
            return Unauthorized();

        var result = await mediator.Send(new GetProfileQuery(userId));
        return Ok(result);
    }
}
