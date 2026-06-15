using System.Globalization;
using EnglishExamApp.Application.Billing;
using EnglishExamApp.Application.Interfaces;
using EnglishExamApp.Application.Utilities;
using EnglishExamApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace EnglishExamApp.API.Payments;

public sealed class VnpayPaymentService(
    IApplicationDbContext context,
    IConfiguration configuration) : IVnpayPaymentService
{
    public async Task<CreateVnpayPaymentUrlResult> CreatePaymentUrlAsync(
        CreateVnpayPaymentUrlCommand command,
        CancellationToken cancellationToken = default)
    {
        var user = await context.Users
            .AsNoTracking()
            .FirstOrDefaultAsync(u => u.Id == command.UserId, cancellationToken);
        if (user is null || !user.IsActive)
        {
            return CreateFailure("TÃ i khoáº£n khÃ´ng há»£p lá»‡ hoáº·c Ä‘Ã£ bá»‹ khÃ³a.");
        }

        var subscription = await context.Subscriptions
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == command.SubscriptionId && s.IsActive, cancellationToken);
        if (subscription is null)
        {
            return CreateFailure("GÃ³i Ä‘Äƒng kÃ½ khÃ´ng tá»“n táº¡i hoáº·c Ä‘ang táº¡m áº©n.");
        }

        var settings = GetSettings();
        if (!settings.IsConfigured)
        {
            return CreateFailure("Cáº¥u hÃ¬nh VNPay chÆ°a Ä‘áº§y Ä‘á»§.");
        }

        var nowUtc = DateTime.UtcNow;
        var nowVn = VietnamDateTimeFormatter.ToVietnamTime(nowUtc);
        var payment = new Payment
        {
            Id = Guid.NewGuid(),
            UserId = command.UserId,
            Amount = decimal.Round(subscription.Price, 2),
            PaymentMethod = "VNPAY",
            Status = "Pending",
            TransactionId = PaymentTransactionMetadata.BuildPending(subscription.Id),
            CreatedAt = nowUtc,
        };

        await context.Payments.AddAsync(payment, cancellationToken);
        await context.SaveChangesAsync(cancellationToken);

        var expireAtVn = nowVn.AddMinutes(15);
        var paymentUrl = BuildPaymentUrl(
            settings,
            subscription,
            payment,
            command.ClientIpAddress,
            command.ReturnUrl,
            nowVn,
            expireAtVn);

        return new CreateVnpayPaymentUrlResult(
            true,
            null,
            new VnpayPaymentUrlDto(
                payment.Id,
                paymentUrl,
                VietnamDateTimeFormatter.ToDisplay(nowUtc)!,
                VietnamDateTimeFormatter.ToDisplay(nowUtc.AddMinutes(15))!));
    }

    public async Task<VnpayCallbackProcessingResult> ProcessCallbackAsync(
        IReadOnlyDictionary<string, string> queryPairs,
        CancellationToken cancellationToken = default)
    {
        var settings = GetSettings();
        if (!settings.IsConfigured)
        {
            return new VnpayCallbackProcessingResult(
                false,
                false,
                false,
                false,
                false,
                "99",
                "Cáº¥u hÃ¬nh VNPay chÆ°a Ä‘áº§y Ä‘á»§.",
                null,
                null);
        }

        var secureHash = queryPairs.TryGetValue("vnp_SecureHash", out var hashValue) ? hashValue : null;
        if (string.IsNullOrWhiteSpace(secureHash))
        {
            return new VnpayCallbackProcessingResult(
                false,
                false,
                false,
                false,
                false,
                "97",
                "Thiáº¿u chá»¯ kÃ½ báº£o máº­t.",
                null,
                null);
        }

        var signData = queryPairs
            .Where(pair => pair.Key.StartsWith("vnp_", StringComparison.OrdinalIgnoreCase)
                && !pair.Key.Equals("vnp_SecureHash", StringComparison.OrdinalIgnoreCase)
                && !pair.Key.Equals("vnp_SecureHashType", StringComparison.OrdinalIgnoreCase)
                && !string.IsNullOrWhiteSpace(pair.Value))
            .ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.Ordinal);

        var isChecksumValid = VnpaySignature.Validate(settings.HashSecret, signData, secureHash);
        if (!isChecksumValid)
        {
            return new VnpayCallbackProcessingResult(
                false,
                false,
                false,
                false,
                false,
                "97",
                "Sai chá»¯ kÃ½ báº£o máº­t.",
                null,
                null);
        }

        if (!queryPairs.TryGetValue("vnp_TxnRef", out var txnRefRaw)
            || !Guid.TryParseExact(txnRefRaw, "N", out var paymentId))
        {
            return new VnpayCallbackProcessingResult(
                true,
                false,
                false,
                false,
                false,
                "01",
                "KhÃ´ng tÃ¬m tháº¥y giao dá»‹ch thanh toÃ¡n.",
                null,
                null);
        }

        var payment = await context.Payments.FirstOrDefaultAsync(p => p.Id == paymentId, cancellationToken);
        if (payment is null)
        {
            return new VnpayCallbackProcessingResult(
                true,
                false,
                false,
                false,
                false,
                "01",
                "KhÃ´ng tÃ¬m tháº¥y giao dá»‹ch thanh toÃ¡n.",
                null,
                null);
        }

        var finalStatuses = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "Success",
            "Failed",
            "Cancelled"
        };
        if (!string.IsNullOrWhiteSpace(payment.Status) && finalStatuses.Contains(payment.Status))
        {
            return new VnpayCallbackProcessingResult(
                true,
                true,
                true,
                true,
                string.Equals(payment.Status, "Success", StringComparison.OrdinalIgnoreCase),
                "02",
                "Giao dá»‹ch Ä‘Ã£ Ä‘Æ°á»£c xÃ¡c nháº­n trÆ°á»›c Ä‘Ã³.",
                payment.Id,
                PaymentTransactionMetadata.ExtractTransactionNumber(payment.TransactionId));
        }

        var amountMatched = queryPairs.TryGetValue("vnp_Amount", out var amountRaw)
            && long.TryParse(amountRaw, out var callbackAmount)
            && callbackAmount == (long)decimal.Round(payment.Amount * 100m, 0, MidpointRounding.AwayFromZero);

        if (!amountMatched)
        {
            return new VnpayCallbackProcessingResult(
                true,
                false,
                false,
                false,
                false,
                "04",
                "Sá»‘ tiá»n giao dá»‹ch khÃ´ng há»£p lá»‡.",
                payment.Id,
                null);
        }

        var responseCode = queryPairs.TryGetValue("vnp_ResponseCode", out var rspCode) ? rspCode : string.Empty;
        var transactionStatus = queryPairs.TryGetValue("vnp_TransactionStatus", out var trxStatus) ? trxStatus : string.Empty;
        var transactionNo = queryPairs.TryGetValue("vnp_TransactionNo", out var trxNo) ? trxNo : null;

        var isSuccess = responseCode == "00" && transactionStatus == "00";
        var subscription = await ResolveSubscriptionFromPaymentAsync(payment, cancellationToken);

        payment.Status = isSuccess ? "Success" : "Failed";
        payment.PaymentMethod = "VNPAY";
        payment.TransactionId = PaymentTransactionMetadata.BuildFinal(transactionNo, subscription?.Id, payment.Id);

        if (isSuccess && subscription is not null)
        {
            await ActivateSubscriptionAsync(payment.UserId, subscription, cancellationToken);
        }

        await context.SaveChangesAsync(cancellationToken);

        return new VnpayCallbackProcessingResult(
            true,
            true,
            true,
            true,
            isSuccess,
            "00",
            isSuccess ? "Thanh toÃ¡n thÃ nh cÃ´ng." : "Thanh toÃ¡n khÃ´ng thÃ nh cÃ´ng.",
            payment.Id,
            transactionNo);
    }

    private static CreateVnpayPaymentUrlResult CreateFailure(string message) =>
        new(false, message, null);

    private static string BuildPaymentUrl(
        VnpaySettings settings,
        Subscription subscription,
        Payment payment,
        string clientIpAddress,
        string? requestedReturnUrl,
        DateTime nowVn,
        DateTime expireAtVn)
    {
        var returnUrl = string.IsNullOrWhiteSpace(requestedReturnUrl)
            ? settings.ReturnUrl
            : requestedReturnUrl.Trim();
        var amountAsLong = (long)decimal.Round(payment.Amount * 100m, 0, MidpointRounding.AwayFromZero);

        var vnpRequestData = new SortedDictionary<string, string>(StringComparer.Ordinal)
        {
            ["vnp_Amount"] = amountAsLong.ToString(CultureInfo.InvariantCulture),
            ["vnp_Command"] = "pay",
            ["vnp_CreateDate"] = nowVn.ToString("yyyyMMddHHmmss"),
            ["vnp_CurrCode"] = "VND",
            ["vnp_IpAddr"] = clientIpAddress,
            ["vnp_Locale"] = settings.Locale,
            ["vnp_OrderInfo"] = $"English4U {subscription.Name} {payment.Id:N}",
            ["vnp_OrderType"] = "other",
            ["vnp_ReturnUrl"] = returnUrl,
            ["vnp_TmnCode"] = settings.TmnCode,
            ["vnp_TxnRef"] = payment.Id.ToString("N"),
            ["vnp_Version"] = "2.1.0",
            ["vnp_ExpireDate"] = expireAtVn.ToString("yyyyMMddHHmmss"),
        };

        return VnpaySignature.BuildPaymentUrl(settings.BaseUrl, settings.HashSecret, vnpRequestData);
    }

    private async Task<Subscription?> ResolveSubscriptionFromPaymentAsync(
        Payment payment,
        CancellationToken cancellationToken)
    {
        var subscriptionId = PaymentTransactionMetadata.ExtractSubscriptionId(payment.TransactionId);
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

    private async Task ActivateSubscriptionAsync(
        Guid userId,
        Subscription subscription,
        CancellationToken cancellationToken)
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
            locale.Trim());
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
}
