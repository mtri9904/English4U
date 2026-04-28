namespace EnglishExamApp.Application.Utilities;

public static class VietnamDateTimeFormatter
{
    private const string DisplayFormat = "dd/MM/yyyy HH:mm";
    private static readonly TimeZoneInfo VietnamTimeZone = ResolveVietnamTimeZone();

    public static string? ToDisplay(DateTime? value)
    {
        if (value is null) return null;

        return ToVietnamTime(value.Value).ToString(DisplayFormat);
    }

    public static DateOnly ToVietnamDate(DateTime value) =>
        DateOnly.FromDateTime(ToVietnamTime(value));

    public static DateOnly? ToVietnamDate(DateTime? value) =>
        value is null ? null : ToVietnamDate(value.Value);

    public static DateTime ToVietnamTime(DateTime value)
    {
        var utcDateTime = value.Kind switch
        {
            DateTimeKind.Utc => value,
            DateTimeKind.Local => value.ToUniversalTime(),
            _ => DateTime.SpecifyKind(value, DateTimeKind.Utc),
        };

        return TimeZoneInfo.ConvertTimeFromUtc(utcDateTime, VietnamTimeZone);
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
}
