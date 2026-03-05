namespace EnglishExamApp.Domain.Entities;

public class SavedQuestion
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid QuestionId { get; set; }
    public string? Note { get; set; }
    public DateTime SavedAt { get; set; } = DateTime.UtcNow;

    public User User { get; set; } = null!;
    public Question Question { get; set; } = null!;
}
