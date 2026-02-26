namespace EnglishLearningApp.Domain.Entities;

public class FlashcardDeck
{
    public Guid Id { get; set; }
    public Guid? CourseId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public Guid? UserId { get; set; }

    public Course? Course { get; set; }
    public User? User { get; set; }
    public ICollection<Flashcard> Flashcards { get; set; } = [];
}
