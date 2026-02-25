namespace EnglishLearningApp.Domain.Entities;

public class UserFlashcardProgress
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid FlashcardId { get; set; }
    public int BoxLevel { get; set; } = 1;
    public DateTime NextReviewDate { get; set; }
    public double EaseFactor { get; set; } = 2.5;

    public User? User { get; set; }
    public Flashcard? Flashcard { get; set; }
}
