namespace EnglishExamApp.Domain.Entities;

public class SpeechTranscript
{
    public Guid Id { get; set; }
    public Guid AudioRecordId { get; set; }
    public string? TranscriptText { get; set; }
    public double? ConfidenceScore { get; set; }
    public double? WordErrorRate { get; set; }

    public UserAudioRecord AudioRecord { get; set; } = null!;
    public ICollection<PhonemeAnalysis> PhonemeAnalyses { get; set; } = [];
}
