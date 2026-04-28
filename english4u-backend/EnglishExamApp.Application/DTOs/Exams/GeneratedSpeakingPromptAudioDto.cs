namespace EnglishExamApp.Application.DTOs.Exams;

public sealed record GeneratedSpeakingPromptAudioDto(
    byte[] AudioBytes,
    string MimeType,
    string FileExtension);
