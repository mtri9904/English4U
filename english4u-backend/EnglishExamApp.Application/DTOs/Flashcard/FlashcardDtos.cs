namespace EnglishExamApp.Application.DTOs.Flashcard;

public sealed record FlashcardDeckDto(
    Guid Id,
    Guid UserId,
    string Title,
    string? Description,
    string Color,
    string? Icon,
    bool IsPublic,
    int TotalCards,
    int DueCards,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public sealed record FlashcardItemDto(
    Guid Id,
    Guid DeckId,
    Guid UserId,
    string Word,
    string? Phonetic,
    string? PartOfSpeech,
    string MeaningVi,
    string? DefinitionEn,
    string? ExampleSentence,
    string? ExampleSentenceVi,
    string? Collocations,
    string? ImageUrl,
    string? AudioUrl,
    string? ContextNote,
    string? QuizDistractors,
    int Repetitions,
    double EaseFactor,
    int IntervalDays,
    DateTime NextReviewDate,
    DateTime? LastReviewedAt,
    int ReviewCount,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public sealed record CreateDeckRequest(
    string Title,
    string? Description,
    string? Color,
    string? Icon,
    bool IsPublic = false);

public sealed record UpdateDeckRequest(
    string Title,
    string? Description,
    string? Color,
    string? Icon,
    bool IsPublic = false);

public sealed record CreateFlashcardItemRequest(
    Guid DeckId,
    string Word,
    string MeaningVi,
    string? Phonetic,
    string? PartOfSpeech,
    string? DefinitionEn,
    string? ExampleSentence,
    string? ExampleSentenceVi,
    string? Collocations,
    string? ImageUrl,
    string? AudioUrl,
    string? ContextNote,
    string? QuizDistractors = null);

public sealed record UpdateFlashcardItemRequest(
    string Word,
    string MeaningVi,
    string? Phonetic,
    string? PartOfSpeech,
    string? DefinitionEn,
    string? ExampleSentence,
    string? ExampleSentenceVi,
    string? Collocations,
    string? ImageUrl,
    string? AudioUrl,
    string? ContextNote,
    string? QuizDistractors = null);

public sealed record ReviewCardRequest(
    // Rating: 1 = Again (fail), 2 = Hard, 3 = Good, 4 = Easy
    int Rating);

public sealed record AiEnrichWordRequest(
    string Word,
    string? Context,
    string? PreferredModel = null);

public sealed record AiEnrichWordResponse(
    string Word,
    string Phonetic,
    string PartOfSpeech,
    string MeaningVi,
    string DefinitionEn,
    string ExampleSentence,
    string ExampleSentenceVi,
    string? Collocations = null,
    string? ImageUrl = null,
    string? ImagePrompt = null,
    string? AudioUrl = null,
    string? QuizDistractors = null,
    string? ModelUsed = null);

public sealed record AiCheckSentenceRequest(
    string Word,
    string MeaningVi,
    string Sentence,
    string? PreferredModel = null);

public sealed record SentenceExampleItem(
    string Level,
    string LevelLabel,
    string Sentence,
    string MeaningVi);

public sealed record AiCheckSentenceResponse(
    bool IsCorrect,
    int Score,
    string FeedbackVi,
    List<string> GrammarErrors,
    string? CorrectedSentence,
    List<SentenceExampleItem> ExamplesByLevel,
    string ImprovedSentenceBand8);
