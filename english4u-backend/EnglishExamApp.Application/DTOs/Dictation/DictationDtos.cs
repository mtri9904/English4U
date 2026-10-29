namespace EnglishExamApp.Application.DTOs.Dictation;

public sealed record DictationGenerateRequestDto(
    string Format = "sentences", // "sentences" | "paragraph" | "cloze"
    string Topic = "daily",       // "daily" | "business" | "travel" | "academic" | custom string
    string Level = "medium",      // "easy" | "medium" | "hard"
    int Count = 5                 // 3, 5, 10
);

public sealed record DictationClozeTokenDto(
    string Word,
    bool IsMasked,
    string? Hint = null
);

public sealed record DictationItemDto(
    int Id,
    string Sentence,
    string Translation,
    IReadOnlyList<string> BlindSpots,
    IReadOnlyList<DictationClozeTokenDto>? ClozeTokens = null,
    string? FocusWord = null,
    string? FocusWordDefinition = null
);

public sealed record DictationExerciseDto(
    string Format,
    string Topic,
    string Level,
    string Title,
    string? FullParagraph,
    string? FullTranslation,
    IReadOnlyList<DictationItemDto> Items
);

