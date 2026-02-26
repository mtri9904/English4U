using EnglishLearningApp.Application.ScoringResults.Queries.GetScoringResultBySessionId;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EnglishLearningApp.API.Controllers;

[ApiController]
[Route("api/scoring-results")]
[Authorize]
public class ScoringResultsController(IMediator mediator) : ControllerBase
{
    [HttpGet("session/{sessionId:guid}")]
    public async Task<IActionResult> GetBySession(Guid sessionId)
    {
        var result = await mediator.Send(new GetScoringResultBySessionIdQuery(sessionId));
        return Ok(result);
    }
}
