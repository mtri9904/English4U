namespace EnglishExamApp.Domain.Entities;

public class QuestionOption
{
    public Guid Id { get; set; }
    public Guid QuestionId { get; set; }
    public string OptionText { get; set; } = string.Empty;
    public string? ImageUrl { get; set; }
    public bool IsCorrect { get; set; }
    public int? OrderIndex { get; set; }

    public Question Question { get; set; } = null!;
}
