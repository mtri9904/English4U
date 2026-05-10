namespace EnglishExamApp.API.Payments;

public interface IVnpayPaymentService
{
    Task<CreateVnpayPaymentUrlResult> CreatePaymentUrlAsync(
        CreateVnpayPaymentUrlCommand command,
        CancellationToken cancellationToken = default);

    Task<VnpayCallbackProcessingResult> ProcessCallbackAsync(
        IReadOnlyDictionary<string, string> queryPairs,
        CancellationToken cancellationToken = default);
}

public sealed record CreateVnpayPaymentUrlCommand(
    Guid UserId,
    Guid SubscriptionId,
    string? ReturnUrl,
    string ClientIpAddress);

public sealed record CreateVnpayPaymentUrlResult(
    bool Success,
    string? ErrorMessage,
    VnpayPaymentUrlDto? Payment);

public sealed record VnpayPaymentUrlDto(
    Guid PaymentId,
    string PaymentUrl,
    string CreatedAt,
    string ExpiresAt);

public sealed record VnpayCallbackProcessingResult(
    bool IsChecksumValid,
    bool IsAlreadyFinalized,
    bool IsAmountMatched,
    bool IsHandled,
    bool Success,
    string ResponseCode,
    string Message,
    Guid? PaymentId,
    string? TransactionNo);
