using System.Security.Claims;
using EnglishLearningApp.Application.Payments.Commands;
using EnglishLearningApp.Application.Payments.Queries;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EnglishLearningApp.API.Controllers;

[ApiController]
[Route("api/payments")]
[Authorize]
public class PaymentsController(IMediator mediator) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetMyPayments()
    {
        var sub = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        if (!Guid.TryParse(sub, out var userId)) return Unauthorized();
        return Ok(await mediator.Send(new GetPaymentsByUserIdQuery(userId)));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreatePaymentRequest request)
    {
        var sub = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        if (!Guid.TryParse(sub, out var userId)) return Unauthorized();

        var result = await mediator.Send(new CreatePaymentCommand(
            userId,
            request.SubscriptionId,
            request.Amount,
            request.PaymentMethod,
            request.TransactionId
        ));
        return Ok(result);
    }
}

public record CreatePaymentRequest(
    Guid SubscriptionId,
    decimal Amount,
    string PaymentMethod,
    string? TransactionId
);
