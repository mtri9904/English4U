using EnglishExamApp.Application.DTOs.Flashcard;

namespace EnglishExamApp.Application.Interfaces;

public interface IFlashcardService
{
    Task<List<FlashcardDeckDto>> GetDecksAsync(Guid userId, CancellationToken cancellationToken = default);
    Task<FlashcardDeckDto?> GetDeckByIdAsync(Guid deckId, Guid userId, CancellationToken cancellationToken = default);
    Task<FlashcardDeckDto> CreateDeckAsync(Guid userId, CreateDeckRequest request, CancellationToken cancellationToken = default);
    Task<FlashcardDeckDto?> UpdateDeckAsync(Guid deckId, Guid userId, UpdateDeckRequest request, CancellationToken cancellationToken = default);
    Task<bool> DeleteDeckAsync(Guid deckId, Guid userId, CancellationToken cancellationToken = default);

    Task<List<FlashcardItemDto>> GetCardsInDeckAsync(Guid deckId, Guid userId, CancellationToken cancellationToken = default);
    Task<List<FlashcardItemDto>> GetStudyCardsAsync(Guid deckId, Guid userId, bool dueOnly = false, CancellationToken cancellationToken = default);
    Task<FlashcardItemDto> CreateCardAsync(Guid userId, CreateFlashcardItemRequest request, CancellationToken cancellationToken = default);
    Task<FlashcardItemDto?> UpdateCardAsync(Guid cardId, Guid userId, UpdateFlashcardItemRequest request, CancellationToken cancellationToken = default);
    Task<bool> DeleteCardAsync(Guid cardId, Guid userId, CancellationToken cancellationToken = default);

    Task<FlashcardItemDto?> ReviewCardAsync(Guid cardId, Guid userId, int rating, CancellationToken cancellationToken = default);

    Task<AiEnrichWordResponse> EnrichWordWithAiAsync(string word, string? context = null, string? preferredModel = null, CancellationToken cancellationToken = default);
    Task<AiCheckSentenceResponse> CheckSentenceWithAiAsync(string word, string meaningVi, string sentence, string? preferredModel = null, CancellationToken cancellationToken = default);
}
