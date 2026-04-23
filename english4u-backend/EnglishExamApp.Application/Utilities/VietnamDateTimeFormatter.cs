namespace EnglishExamApp.Application.Utilities;

public static class VietnamDateTimeFormatter
{
    private const string DisplayFormat = "dd/MM/yyyy HH:mm";
    private static readonly TimeZoneInfo VietnamTimeZone = ResolveVietnamTimeZone();

    public static string? ToDisplay(DateTime? value)
    {
        if (value is null) return null;

        var utcDateTime = value.Value.Kind switch
        {
            DateTimeKind.Utc => value.Value,
            DateTimeKind.Local => value.Value.ToUniversalTime(),
            _ => DateTime.SpecifyKind(value.Value, DateTimeKind.Utc),
        };

        var vietnamDateTime = TimeZoneInfo.ConvertTimeFromUtc(utcDateTime, VietnamTimeZone);
        return vietnamDateTime.ToString(DisplayFormat);
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
