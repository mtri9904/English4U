using System.Security.Cryptography;
using System.Text;

namespace EnglishExamApp.API.Payments;

internal static class VnpaySignature
{
    public static string BuildPaymentUrl(string baseUrl, string hashSecret, SortedDictionary<string, string> requestData)
    {
        var queryString = BuildQueryString(requestData);
        var secureHash = ComputeHmacSha512(hashSecret, queryString);
        return $"{baseUrl}?{queryString}&vnp_SecureHash={secureHash}";
    }

    public static bool Validate(string hashSecret, IDictionary<string, string> requestData, string secureHash)
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
}
