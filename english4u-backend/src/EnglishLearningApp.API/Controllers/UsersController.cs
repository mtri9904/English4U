using System.Security.Claims;
using EnglishLearningApp.Application.Users.Queries.GetProfile;
using EnglishLearningApp.Domain.Services;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EnglishLearningApp.API.Controllers;

[ApiController]
[Route("api/users")]
[Authorize]
public class UsersController(IMediator mediator, IMediaService mediaService) : ControllerBase
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

    [HttpPost("{id:guid}/avatar")]
    public async Task<IActionResult> UploadAvatar(Guid id, IFormFile file)
    {
        if (file is null || file.Length == 0)
            return BadRequest("File không hợp lệ.");

        var allowedTypes = new[] { "image/jpeg", "image/png", "image/webp" };
        if (!allowedTypes.Contains(file.ContentType))
            return BadRequest("Chỉ hỗ trợ định dạng JPG, PNG, WEBP.");

        await using var stream = file.OpenReadStream();
        var url = await mediaService.UploadImageAsync(stream, file.FileName);
        return Ok(new { AvatarUrl = url });
    }
}
