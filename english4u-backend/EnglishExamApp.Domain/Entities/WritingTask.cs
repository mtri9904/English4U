namespace EnglishExamApp.Domain.Entities;

public class WritingTask
{
    public Guid Id { get; set; }
    public Guid SectionId { get; set; }
    public int? TaskNumber { get; set; }
    public string PromptText { get; set; } = string.Empty;
    public string? AssetsData { get; set; }
    public int MinWords { get; set; } = 150;

    public ExamSection Section { get; set; } = null!;
    public ICollection<UserAnswer> UserAnswers { get; set; } = [];
}
