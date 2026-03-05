namespace EnglishExamApp.Domain.Entities;

public class UserAudioRecord
{
    public Guid Id { get; set; }
    public Guid AnswerId { get; set; }
    public string AudioUrl { get; set; } = string.Empty;
    public double? DurationSeconds { get; set; }
    public int? FileSizeKB { get; set; }

    public UserAnswer Answer { get; set; } = null!;
    public ICollection<SpeechTranscript> SpeechTranscripts { get; set; } = [];
}
