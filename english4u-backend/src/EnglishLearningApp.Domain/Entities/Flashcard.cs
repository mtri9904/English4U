namespace EnglishLearningApp.Domain.Entities;

public class Flashcard
{
    public Guid Id { get; set; }
    public Guid DeckId { get; set; }
    public string FrontText { get; set; } = string.Empty;
    public string BackText { get; set; } = string.Empty;
    public string? AudioUrl { get; set; }
    public string? ExampleSentence { get; set; }

    public FlashcardDeck? Deck { get; set; }
    public ICollection<UserFlashcardProgress> UserProgresses { get; set; } = [];
}
