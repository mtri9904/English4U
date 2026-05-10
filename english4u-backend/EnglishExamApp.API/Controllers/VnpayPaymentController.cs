using EnglishExamApp.API.Authentication;
using EnglishExamApp.API.Payments;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EnglishExamApp.API.Controllers;

[ApiController]
[Route("api/payments/vnpay")]
public class VnpayPaymentController(
    ICurrentUserService currentUser,
    IVnpayPaymentService vnpayPaymentService) : ControllerBase
{
    public sealed record CreatePaymentUrlRequest(Guid SubscriptionId, string? ReturnUrl = null);

    public sealed record VnpayReturnResponse(
        bool Success,
        string ResponseCode,
        string Message,
        Guid? PaymentId,
        string? TransactionNo);

    [HttpPost("create")]
    [Authorize]
    public async Task<IResult> CreatePaymentUrl(
        [FromBody] CreatePaymentUrlRequest request,
        CancellationToken cancellationToken)
    {
        if (!currentUser.TryGetUserId(out var userId))
        {
            return TypedResults.Unauthorized();
        }

        var result = await vnpayPaymentService.CreatePaymentUrlAsync(
            new CreateVnpayPaymentUrlCommand(
                userId,
                request.SubscriptionId,
                request.ReturnUrl,
                ResolveClientIpAddress()),
            cancellationToken);

        return result.Success
            ? TypedResults.Ok(result.Payment)
            : TypedResults.BadRequest(new { message = result.ErrorMessage });
    }

    [HttpGet("return")]
    public async Task<IResult> HandleReturn(CancellationToken cancellationToken)
    {
        var result = await vnpayPaymentService.ProcessCallbackAsync(ReadQueryPairs(), cancellationToken);
        return TypedResults.Ok(new VnpayReturnResponse(
            result.Success,
            result.ResponseCode,
            result.Message,
            result.PaymentId,
            result.TransactionNo));
    }

    [HttpGet("ipn")]
    public async Task<IResult> HandleIpn(CancellationToken cancellationToken)
    {
        var result = await vnpayPaymentService.ProcessCallbackAsync(ReadQueryPairs(), cancellationToken);

        if (!result.IsChecksumValid)
        {
            return TypedResults.Ok(new { RspCode = "97", Message = "Invalid checksum" });
        }

        if (!result.PaymentId.HasValue)
        {
            return TypedResults.Ok(new { RspCode = "01", Message = "Order not found" });
        }

        if (result.IsAlreadyFinalized)
        {
            return TypedResults.Ok(new { RspCode = "02", Message = "Order already confirmed" });
        }

        if (!result.IsAmountMatched)
        {
            return TypedResults.Ok(new { RspCode = "04", Message = "Invalid amount" });
        }

        if (!result.IsHandled)
        {
            return TypedResults.Ok(new { RspCode = "99", Message = "Unknown error" });
        }

        return TypedResults.Ok(new { RspCode = "00", Message = "Confirm Success" });
    }

    private IReadOnlyDictionary<string, string> ReadQueryPairs() =>
        Request.Query.ToDictionary(
            pair => pair.Key,
            pair => pair.Value.ToString(),
            StringComparer.Ordinal);

    private string ResolveClientIpAddress()
    {
        var forwardedFor = Request.Headers["X-Forwarded-For"].FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(forwardedFor))
        {
            return forwardedFor.Split(',')[0].Trim();
        }

        return HttpContext.Connection.RemoteIpAddress?.ToString() ?? "127.0.0.1";
    }
}
