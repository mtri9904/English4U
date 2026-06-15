namespace EnglishExamApp.Application.Billing;

public static class PaymentTransactionMetadata
{
    private const string SubscriptionMarker = "SUB:";

    public static string BuildPending(Guid subscriptionId) => $"PENDING|{SubscriptionMarker}{subscriptionId:N}";

    public static string BuildFinal(string? transactionNo, Guid? subscriptionId, Guid paymentId)
    {
        var transactionPart = string.IsNullOrWhiteSpace(transactionNo)
            ? $"TXNREF:{paymentId:N}"
            : transactionNo;

        return subscriptionId.HasValue
            ? $"{transactionPart}|{SubscriptionMarker}{subscriptionId.Value:N}"
            : transactionPart;
    }

    public static string? ExtractTransactionNumber(string? transactionId)
    {
        if (string.IsNullOrWhiteSpace(transactionId))
        {
            return null;
        }

        return transactionId.Split('|').FirstOrDefault();
    }

    public static Guid? ExtractSubscriptionId(string? transactionId)
    {
        if (string.IsNullOrWhiteSpace(transactionId))
        {
            return null;
        }

        var markerIndex = transactionId.IndexOf(SubscriptionMarker, StringComparison.OrdinalIgnoreCase);
        if (markerIndex < 0)
        {
            return null;
        }

        var raw = transactionId[(markerIndex + SubscriptionMarker.Length)..]
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
}
