using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using EnglishExamApp.Application.Interfaces;
using EnglishExamApp.Application.Utilities;
using EnglishExamApp.Domain.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EnglishExamApp.API.Controllers;

[ApiController]
[Route("api/payments/vnpay")]
public class VnpayPaymentController(IApplicationDbContext context, IConfiguration configuration) : ControllerBase
{
    public sealed record CreatePaymentUrlRequest(Guid SubscriptionId, string? ReturnUrl = null);
    public sealed record CreatePaymentUrlResponse(Guid PaymentId, string PaymentUrl, string CreatedAt, string ExpiresAt);
    public sealed record VnpayReturnResponse(
        bool Success,
        string ResponseCode,
        string Message,
        Guid? PaymentId,
        string? TransactionNo);

    [HttpPost("create")]
    public async Task<IResult> CreatePaymentUrl([FromBody] CreatePaymentUrlRequest request, CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(Request.Headers["X-User-Id"].FirstOrDefault(), out var userId))
        {
            return TypedResults.Unauthorized();
        }

        var user = await context.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);
        if (user is null || !user.IsActive)
        {
            return TypedResults.BadRequest(new { message = "Tài khoản không hợp lệ hoặc đã bị khóa." });
        }

        var subscription = await context.Subscriptions
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == request.SubscriptionId && s.IsActive, cancellationToken);
        if (subscription is null)
        {
            return TypedResults.BadRequest(new { message = "Gói đăng ký không tồn tại hoặc đang tạm ẩn." });
        }

        var settings = GetSettings();
        if (!settings.IsConfigured)
        {
            return TypedResults.BadRequest(new { message = "Cấu hình VNPay chưa đầy đủ." });
        }

        var nowUtc = DateTime.UtcNow;
        var nowVn = ConvertToVietnamTime(nowUtc);
        var payment = new Payment
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Amount = decimal.Round(subscription.Price, 2),
            PaymentMethod = "VNPAY",
            Status = "Pending",
            TransactionId = BuildPendingTransactionMetadata(subscription.Id),
            CreatedAt = nowUtc,
        };

        await context.Payments.AddAsync(payment, cancellationToken);
        await context.SaveChangesAsync(cancellationToken);

        var txnRef = payment.Id.ToString("N");
        var returnUrl = string.IsNullOrWhiteSpace(request.ReturnUrl) ? settings.ReturnUrl : request.ReturnUrl.Trim();
        var amountAsLong = (long)decimal.Round(payment.Amount * 100m, 0, MidpointRounding.AwayFromZero);
        var expireAtVn = nowVn.AddMinutes(15);

        var vnpRequestData = new SortedDictionary<string, string>(StringComparer.Ordinal)
        {
            ["vnp_Amount"] = amountAsLong.ToString(CultureInfo.InvariantCulture),
            ["vnp_Command"] = "pay",
            ["vnp_CreateDate"] = nowVn.ToString("yyyyMMddHHmmss"),
            ["vnp_CurrCode"] = "VND",
            ["vnp_IpAddr"] = ResolveClientIpAddress(),
            ["vnp_Locale"] = settings.Locale,
            ["vnp_OrderInfo"] = $"English4U {subscription.Name} {payment.Id:N}",
            ["vnp_OrderType"] = "other",
            ["vnp_ReturnUrl"] = returnUrl,
            ["vnp_TmnCode"] = settings.TmnCode,
            ["vnp_TxnRef"] = txnRef,
            ["vnp_Version"] = "2.1.0",
            ["vnp_ExpireDate"] = expireAtVn.ToString("yyyyMMddHHmmss"),
        };

        var paymentUrl = BuildPaymentUrl(settings.BaseUrl, settings.HashSecret, vnpRequestData);

        return TypedResults.Ok(new CreatePaymentUrlResponse(
            payment.Id,
            paymentUrl,
            VietnamDateTimeFormatter.ToDisplay(nowUtc)!,
            VietnamDateTimeFormatter.ToDisplay(nowUtc.AddMinutes(15))!
        ));
    }

    [HttpGet("return")]
    public async Task<IResult> HandleReturn(CancellationToken cancellationToken)
    {
        var result = await ProcessCallbackAsync(cancellationToken);
        return TypedResults.Ok(new VnpayReturnResponse(
            result.Success,
            result.ResponseCode,
            result.Message,
            result.PaymentId,
            result.TransactionNo
        ));
    }

    [HttpGet("ipn")]
    public async Task<IResult> HandleIpn(CancellationToken cancellationToken)
    {
        var result = await ProcessCallbackAsync(cancellationToken);

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

    private async Task<CallbackProcessingResult> ProcessCallbackAsync(CancellationToken cancellationToken)
    {
        var settings = GetSettings();
        if (!settings.IsConfigured)
        {
            return new CallbackProcessingResult(
                false,
                false,
                false,
                false,
                false,
                "99",
                "Cấu hình VNPay chưa đầy đủ.",
                null,
                null
            );
        }

        var queryPairs = Request.Query
            .ToDictionary(
                pair => pair.Key,
                pair => pair.Value.ToString(),
                StringComparer.Ordinal);

        var secureHash = queryPairs.TryGetValue("vnp_SecureHash", out var hashValue) ? hashValue : null;
        if (string.IsNullOrWhiteSpace(secureHash))
        {
            return new CallbackProcessingResult(
                false,
                false,
                false,
                false,
                false,
                "97",
                "Thiếu chữ ký bảo mật.",
                null,
                null
            );
        }

        var signData = queryPairs
            .Where(pair => pair.Key.StartsWith("vnp_", StringComparison.OrdinalIgnoreCase)
                && !pair.Key.Equals("vnp_SecureHash", StringComparison.OrdinalIgnoreCase)
                && !pair.Key.Equals("vnp_SecureHashType", StringComparison.OrdinalIgnoreCase)
                && !string.IsNullOrWhiteSpace(pair.Value))
            .ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.Ordinal);

        var isChecksumValid = ValidateSignature(settings.HashSecret, signData, secureHash);
        if (!isChecksumValid)
        {
            return new CallbackProcessingResult(
                false,
                false,
                false,
                false,
                false,
                "97",
                "Sai chữ ký bảo mật.",
                null,
                null
            );
        }

        if (!queryPairs.TryGetValue("vnp_TxnRef", out var txnRefRaw)
            || !Guid.TryParseExact(txnRefRaw, "N", out var paymentId))
        {
            return new CallbackProcessingResult(
                true,
                false,
                false,
                false,
                false,
                "01",
                "Không tìm thấy giao dịch thanh toán.",
                null,
                null
            );
        }

        var payment = await context.Payments.FirstOrDefaultAsync(p => p.Id == paymentId, cancellationToken);
        if (payment is null)
        {
            return new CallbackProcessingResult(
                true,
                false,
                false,
                false,
                false,
                "01",
                "Không tìm thấy giao dịch thanh toán.",
                null,
                null
            );
        }

        var finalStatuses = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "Success", "Failed", "Cancelled" };
        if (!string.IsNullOrWhiteSpace(payment.Status) && finalStatuses.Contains(payment.Status))
        {
            return new CallbackProcessingResult(
                true,
                true,
                true,
                true,
                string.Equals(payment.Status, "Success", StringComparison.OrdinalIgnoreCase),
                "02",
                "Giao dịch đã được xác nhận trước đó.",
                payment.Id,
                ExtractTransactionNumber(payment.TransactionId)
            );
        }

        var amountMatched = queryPairs.TryGetValue("vnp_Amount", out var amountRaw)
            && long.TryParse(amountRaw, out var callbackAmount)
            && callbackAmount == (long)decimal.Round(payment.Amount * 100m, 0, MidpointRounding.AwayFromZero);

        if (!amountMatched)
        {
            return new CallbackProcessingResult(
                true,
                false,
                false,
                false,
                false,
                "04",
                "Số tiền giao dịch không hợp lệ.",
                payment.Id,
                null
            );
        }

        var responseCode = queryPairs.TryGetValue("vnp_ResponseCode", out var rspCode) ? rspCode : string.Empty;
        var transactionStatus = queryPairs.TryGetValue("vnp_TransactionStatus", out var trxStatus) ? trxStatus : string.Empty;
        var transactionNo = queryPairs.TryGetValue("vnp_TransactionNo", out var trxNo) ? trxNo : null;

        var isSuccess = responseCode == "00" && transactionStatus == "00";
        var subscription = await ResolveSubscriptionFromPaymentAsync(payment, cancellationToken);

        payment.Status = isSuccess ? "Success" : "Failed";
        payment.PaymentMethod = "VNPAY";
        payment.TransactionId = BuildFinalTransactionMetadata(transactionNo, subscription?.Id, payment.Id);

        if (isSuccess && subscription is not null)
        {
            await ActivateSubscriptionAsync(payment.UserId, subscription, cancellationToken);
        }

        await context.SaveChangesAsync(cancellationToken);

        return new CallbackProcessingResult(
            true,
            true,
            true,
            true,
            isSuccess,
            "00",
            isSuccess ? "Thanh toán thành công." : "Thanh toán không thành công.",
            payment.Id,
            transactionNo
        );
    }

    private async Task<Subscription?> ResolveSubscriptionFromPaymentAsync(Payment payment, CancellationToken cancellationToken)
    {
        var subscriptionId = ExtractSubscriptionId(payment.TransactionId);
        if (subscriptionId.HasValue)
        {
            return await context.Subscriptions.FirstOrDefaultAsync(s => s.Id == subscriptionId.Value, cancellationToken);
        }

        var roundedAmount = decimal.Round(payment.Amount, 2);
        return await context.Subscriptions
            .OrderByDescending(s => s.IsActive)
            .ThenBy(s => s.DurationDays)
            .FirstOrDefaultAsync(s => decimal.Round(s.Price, 2) == roundedAmount, cancellationToken);
    }

    private async Task ActivateSubscriptionAsync(Guid userId, Subscription subscription, CancellationToken cancellationToken)
    {
        var nowUtc = DateTime.UtcNow;
        var activeSubscriptions = await context.UserSubscriptions
            .Where(us => us.UserId == userId && us.Status == "Active" && us.EndDate >= nowUtc)
            .ToListAsync(cancellationToken);

        foreach (var item in activeSubscriptions)
        {
            item.Status = "Expired";
            if (item.EndDate > nowUtc)
            {
                item.EndDate = nowUtc;
            }
        }

        var newSubscription = new UserSubscription
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            SubscriptionId = subscription.Id,
            StartDate = nowUtc,
            EndDate = nowUtc.AddDays(subscription.DurationDays),
            Status = "Active",
        };

        await context.UserSubscriptions.AddAsync(newSubscription, cancellationToken);
    }

    private string ResolveClientIpAddress()
    {
        var forwardedFor = Request.Headers["X-Forwarded-For"].FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(forwardedFor))
        {
            return forwardedFor.Split(',')[0].Trim();
        }

        return HttpContext.Connection.RemoteIpAddress?.ToString() ?? "127.0.0.1";
    }

    private VnpaySettings GetSettings()
    {
        var tmnCode = configuration["Vnpay:TmnCode"] ?? string.Empty;
        var hashSecret = configuration["Vnpay:HashSecret"] ?? string.Empty;
        var baseUrl = configuration["Vnpay:BaseUrl"] ?? string.Empty;
        var returnUrl = configuration["Vnpay:ReturnUrl"] ?? string.Empty;
        var locale = configuration["Vnpay:Locale"] ?? "vn";

        return new VnpaySettings(
            tmnCode.Trim(),
            hashSecret.Trim(),
            baseUrl.Trim(),
            returnUrl.Trim(),
            locale.Trim()
        );
    }

    private static string BuildPaymentUrl(string baseUrl, string hashSecret, SortedDictionary<string, string> requestData)
    {
        var queryString = BuildQueryString(requestData);
        var secureHash = ComputeHmacSha512(hashSecret, queryString);
        return $"{baseUrl}?{queryString}&vnp_SecureHash={secureHash}";
    }

    private static bool ValidateSignature(string hashSecret, IDictionary<string, string> requestData, string secureHash)
    {
        var queryString = BuildQueryString(new SortedDictionary<string, string>(requestData, StringComparer.Ordinal));
        var calculatedHash = ComputeHmacSha512(hashSecret, queryString);
        return string.Equals(calculatedHash, secureHash, StringComparison.OrdinalIgnoreCase);
    }

    private static string BuildQueryString(SortedDictionary<string, string> data)
    {
        return string.Join("&", data
            .Where(pair => !string.IsNullOrWhiteSpace(pair.Value))
            .Select(pair => $"{pair.Key}={Uri.EscapeDataString(pair.Value)}"));
    }

    private static string ComputeHmacSha512(string key, string inputData)
    {
        var keyBytes = Encoding.UTF8.GetBytes(key);
        var inputBytes = Encoding.UTF8.GetBytes(inputData);
        using var hmac = new HMACSHA512(keyBytes);
        var hashBytes = hmac.ComputeHash(inputBytes);
        return Convert.ToHexString(hashBytes);
    }

    private static DateTime ConvertToVietnamTime(DateTime utc)
    {
        return TimeZoneInfo.ConvertTimeFromUtc(utc, ResolveVietnamTimeZone());
    }

    private static TimeZoneInfo ResolveVietnamTimeZone()
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById("SE Asia Standard Time");
        }
        catch
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById("Asia/Ho_Chi_Minh");
            }
            catch
            {
                return TimeZoneInfo.Utc;
            }
        }
    }

    private static string BuildPendingTransactionMetadata(Guid subscriptionId) => $"PENDING|SUB:{subscriptionId:N}";

    private static string BuildFinalTransactionMetadata(string? transactionNo, Guid? subscriptionId, Guid paymentId)
    {
        var transactionPart = string.IsNullOrWhiteSpace(transactionNo) ? $"TXNREF:{paymentId:N}" : transactionNo;
        return subscriptionId.HasValue
            ? $"{transactionPart}|SUB:{subscriptionId.Value:N}"
            : transactionPart;
    }

    private static string? ExtractTransactionNumber(string? transactionId)
    {
        if (string.IsNullOrWhiteSpace(transactionId))
        {
            return null;
        }

        return transactionId.Split('|').FirstOrDefault();
    }

    private static Guid? ExtractSubscriptionId(string? transactionId)
    {
        if (string.IsNullOrWhiteSpace(transactionId))
        {
            return null;
        }

        const string marker = "SUB:";
        var markerIndex = transactionId.IndexOf(marker, StringComparison.OrdinalIgnoreCase);
        if (markerIndex < 0)
        {
            return null;
        }

        var raw = transactionId[(markerIndex + marker.Length)..]
            .Split('|', ';', ',', ' ')
            .FirstOrDefault();
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        if (Guid.TryParseExact(raw, "N", out var guidN))
        {
            return guidN;
        }

        return Guid.TryParse(raw, out var guid) ? guid : null;
    }

    private sealed record VnpaySettings(
        string TmnCode,
        string HashSecret,
        string BaseUrl,
        string ReturnUrl,
        string Locale)
    {
        public bool IsConfigured =>
            !string.IsNullOrWhiteSpace(TmnCode)
            && !string.IsNullOrWhiteSpace(HashSecret)
            && !string.IsNullOrWhiteSpace(BaseUrl)
            && !string.IsNullOrWhiteSpace(ReturnUrl);
    }

    private sealed record CallbackProcessingResult(
        bool IsChecksumValid,
        bool IsAlreadyFinalized,
        bool IsAmountMatched,
        bool IsHandled,
        bool Success,
        string ResponseCode,
        string Message,
        Guid? PaymentId,
        string? TransactionNo);
}
