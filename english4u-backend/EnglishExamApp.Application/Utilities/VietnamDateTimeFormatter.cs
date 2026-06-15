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

    public static (DateTime StartUtc, DateTime EndUtc) GetTodayUtcRange()
    {
        var todayVn = DateOnly.FromDateTime(ToVietnamTime(DateTime.UtcNow));
        return GetUtcRange(todayVn);
    }

    public static (DateTime StartUtc, DateTime EndUtc) GetUtcRange(DateOnly vietnamDate)
    {
        var startVn = vietnamDate.ToDateTime(TimeOnly.MinValue);
        var endVn = startVn.AddDays(1);

        return (
            TimeZoneInfo.ConvertTimeToUtc(startVn, VietnamTimeZone),
            TimeZoneInfo.ConvertTimeToUtc(endVn, VietnamTimeZone));
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
