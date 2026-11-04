namespace EnglishExamApp.Application.Utilities;

/// <summary>
/// Centralized AI Model configuration for the entire system (Single Source of Truth).
/// Modify this file to add, remove, or reorder fallback models system-wide.
/// </summary>
public static class AiModelDefaults
{
    /// <summary>
    /// Default primary model for the entire system (Quota: 500 RPD, 15 RPM)
    /// </summary>
    public const string DefaultPrimaryModel = "gemini-3.1-flash-lite";

    /// <summary>
    /// Ordered list of system-wide fallback models
    /// </summary>
    public static readonly string[] GlobalFallbackModels =
    [
        "gemma-4-26b-a4b-it",   // 16K RPD, 30 RPM (High limit: 16,000 RPD)
        "gemma-4-31b-it",       // 16K RPD, 30 RPM (High limit: 16,000 RPD)
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
