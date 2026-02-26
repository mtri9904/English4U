using System.Security.Claims;
using EnglishLearningApp.Application.CourseReviews.Commands;
using EnglishLearningApp.Application.CourseReviews.Queries;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EnglishLearningApp.API.Controllers;

[ApiController]
[Route("api/courses/{courseId:guid}/reviews")]
public class CourseReviewsController(IMediator mediator) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetByCourse(Guid courseId)
        => Ok(await mediator.Send(new GetReviewsByCourseIdQuery(courseId)));

    [HttpPost]
    [Authorize]
    public async Task<IActionResult> Create(Guid courseId, [FromBody] CreateReviewRequest request)
    {
        var sub = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        if (!Guid.TryParse(sub, out var userId)) return Unauthorized();
        var result = await mediator.Send(new CreateReviewCommand(courseId, userId, request.Rating, request.Comment));
        return Ok(result);
    }
}

public record CreateReviewRequest(int Rating, string? Comment);
