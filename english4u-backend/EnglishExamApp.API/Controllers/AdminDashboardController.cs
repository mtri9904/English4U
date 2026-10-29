using EnglishExamApp.Application.DTOs.AdminDashboard;
using EnglishExamApp.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EnglishExamApp.API.Controllers;

[ApiController]
[Route("api/admin/dashboard")]
[Authorize(Roles = "Admin")]
public class AdminDashboardController(IExamExecutionService examExecutionService) : ControllerBase
{
    [HttpGet]
    public async Task<IResult> GetDashboard(CancellationToken cancellationToken)
    {
        var dashboard = await examExecutionService.GetAdminDashboardAsync(cancellationToken);
        return TypedResults.Ok(dashboard);
    }
}

