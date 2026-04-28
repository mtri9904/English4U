namespace EnglishExamApp.Domain.Entities;

public class SpeakingQuestion
{
    public Guid Id { get; set; }
    public Guid PartId { get; set; }
    public string Content { get; set; } = string.Empty;
    public string? CueCardPoints { get; set; }
    public string? AudioPromptUrl { get; set; }
    public int? OrderIndex { get; set; }

    public SpeakingPart Part { get; set; } = null!;
    public ICollection<UserAnswer> UserAnswers { get; set; } = [];
}
