namespace EnglishExamApp.Domain.Entities;

public class PhonemeAnalysis
{
    public Guid Id { get; set; }
    public Guid TranscriptId { get; set; }
    public string? Word { get; set; }
    public string? ExpectedPhoneme { get; set; }
    public string? ActualPhoneme { get; set; }
    public bool? IsCorrect { get; set; }

    public SpeechTranscript Transcript { get; set; } = null!;
}
