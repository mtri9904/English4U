using EnglishExamApp.Application.DTOs.Users;
using EnglishExamApp.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EnglishExamApp.API.Controllers;

[ApiController]
[Route("api/admin/users")]
[Authorize(Roles = "Admin")]
public class AdminUserController(IUserService userService) : ControllerBase
{
    [HttpGet("stats")]
    public async Task<IResult> GetStats(CancellationToken cancellationToken)
    {
        var stats = await userService.GetUserManagementStatsAsync(cancellationToken);
        return TypedResults.Ok(stats);
    }

    [HttpGet]
    public async Task<IResult> GetUsers([FromQuery] UserPagedRequest request, CancellationToken cancellationToken)
    {
        var result = await userService.GetPagedUsersAsync(request, cancellationToken);
        return TypedResults.Ok(result);
    }

    [HttpGet("{id:guid}")]
    public async Task<IResult> GetUserDetail(Guid id, CancellationToken cancellationToken)
    {
        var user = await userService.GetUserDetailAsync(id, cancellationToken);
        return user is null 
            ? TypedResults.NotFound(new { message = "User not found" }) 
            : TypedResults.Ok(user);
    }

    [HttpPatch("{id:guid}/status")]
    public async Task<IResult> ToggleUserStatus(Guid id, [FromBody] ToggleStatusRequest request, CancellationToken cancellationToken)
    {
        var result = await userService.ToggleUserStatusAsync(id, request.IsActive, cancellationToken);
        return result 
            ? TypedResults.Ok(new { message = $"User status updated to {(request.IsActive ? "Active" : "Inactive")}" })
            : TypedResults.NotFound(new { message = "User not found" });
    }

    [HttpPatch("{id:guid}/role")]
    public async Task<IResult> UpdateUserRole(Guid id, [FromBody] UpdateRoleRequest request, CancellationToken cancellationToken)
    {
        var result = await userService.UpdateUserRoleAsync(id, request.RoleName, cancellationToken);
        return result 
            ? TypedResults.Ok(new { message = $"User role updated to {request.RoleName}" })
            : TypedResults.BadRequest(new { message = "Update role failed. User not found or role invalid." });
    }

    [HttpDelete("{id:guid}")]
    public async Task<IResult> DeleteUser(Guid id, CancellationToken cancellationToken)
    {
        var result = await userService.DeleteUserAsync(id, cancellationToken);
        return result 
            ? TypedResults.Ok(new { message = "User deleted successfully" })
            : TypedResults.NotFound(new { message = "User not found" });
    }

    public record ToggleStatusRequest(bool IsActive);
    public record UpdateRoleRequest(string RoleName);
}
