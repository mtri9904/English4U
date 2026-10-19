namespace EnglishExamApp.Domain.Entities;

public class FlashcardItem
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DeckId { get; set; }
    public Guid UserId { get; set; }

    // Vocabulary Content
    public string Word { get; set; } = string.Empty;
    public string? Phonetic { get; set; }
    public string? PartOfSpeech { get; set; }
    public string MeaningVi { get; set; } = string.Empty;
    public string? DefinitionEn { get; set; }
    public string? ExampleSentence { get; set; }
    public string? ExampleSentenceVi { get; set; }
    public string? Collocations { get; set; }
    public string? ImageUrl { get; set; }
    public string? AudioUrl { get; set; }
    public string? ContextNote { get; set; }
    public string? QuizDistractors { get; set; }

    // Spaced Repetition (SM-2 Algorithm)
    public int Repetitions { get; set; } = 0;
    public double EaseFactor { get; set; } = 2.5;
    public int IntervalDays { get; set; } = 0;
    public DateTime NextReviewDate { get; set; } = DateTime.UtcNow;
    public DateTime? LastReviewedAt { get; set; }
    public int ReviewCount { get; set; } = 0;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public FlashcardDeck Deck { get; set; } = null!;
    public User User { get; set; } = null!;
}
