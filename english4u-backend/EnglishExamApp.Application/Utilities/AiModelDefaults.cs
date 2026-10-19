namespace EnglishExamApp.Application.Utilities;

/// <summary>
/// Cấu hình danh sách AI Model tập trung duy nhất cho toàn bộ hệ thống (Single Source of Truth).
/// Nếu cần thêm, sửa, đổi thứ tự fallback thì chỉ cần chỉnh sửa tại file này.
/// </summary>
public static class AiModelDefaults
{
    /// <summary>
    /// Model chính ưu tiên cho toàn hệ thống (Hạn mức 500 RPD, 15 RPM)
    /// </summary>
    public const string DefaultPrimaryModel = "gemini-3.1-flash-lite";

    /// <summary>
    /// Danh sách toàn bộ Fallback Models theo thứ tự ưu tiên cho toàn hệ thống
    /// </summary>
    public static readonly string[] GlobalFallbackModels =
    [
        "gemma-4-26b-a4b-it",   // 16K RPD, 30 RPM (Hạn mức cực đại 16.000 RPD)
        "gemma-4-31b-it",       // 16K RPD, 30 RPM (Hạn mức cực đại 16.000 RPD)
        "gemini-3.1-flash-lite", // 500 RPD, 15 RPM
        "gemini-3.5-flash-lite", // 500 RPD, 15 RPM
        "gemini-2.5-flash",      // 20 RPD, 5 RPM
        "gemini-2.5-flash-lite", // 20 RPD, 10 RPM
        "gemini-3.8-flash",      // 20 RPD, 5 RPM
        "gemini-3.7-flash",      // 20 RPD, 5 RPM
        "gemini-3.6-flash",      // 20 RPD, 5 RPM
        "gemini-3.5-flash",      // 20 RPD, 5 RPM
        "gemini-3-flash-preview",
        "gemini-flash-latest",
        "gemini-flash-lite-latest",
        "gemini-2.5-pro",
        "gemini-3.1-pro-preview",
        "gemini-pro-latest"
    ];
}
