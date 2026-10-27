import { callApi } from '@/apis/handleApi';
import { ApiRouters } from '@/constants/api-routes';
import type {
    FlashcardDeckDto,
    FlashcardItemDto,
    CreateDeckRequest,
    UpdateDeckRequest,
    CreateFlashcardItemRequest,
    UpdateFlashcardItemRequest,
    AiEnrichWordResponse,
    AiCheckSentenceResponse,
} from '../types/flashcard.types';

/**
 * Flashcard Service
 * Follows the enterprise pattern from Mebifarm CMS (web)
 * Centralizes all flashcard API calls using callApi and ApiRouters.FLASHCARD
 */
export const flashcardService = {
    // ----------------- Decks -----------------
    getDecks: async (): Promise<FlashcardDeckDto[]> => {
        return callApi<FlashcardDeckDto[]>(ApiRouters.FLASHCARD.DECKS, undefined, 'get');
    },

    getDeckById: async (id: string): Promise<FlashcardDeckDto> => {
        return callApi<FlashcardDeckDto>(ApiRouters.FLASHCARD.DECK_BY_ID(id), undefined, 'get');
    },

    createDeck: async (data: CreateDeckRequest): Promise<FlashcardDeckDto> => {
        return callApi<FlashcardDeckDto>(ApiRouters.FLASHCARD.DECKS, data, 'post');
    },

    updateDeck: async (id: string, data: UpdateDeckRequest): Promise<FlashcardDeckDto> => {
        return callApi<FlashcardDeckDto>(ApiRouters.FLASHCARD.DECK_BY_ID(id), data, 'put');
    },

    deleteDeck: async (id: string): Promise<void> => {
        return callApi<void>(ApiRouters.FLASHCARD.DECK_BY_ID(id), undefined, 'delete');
    },

    // ----------------- Cards -----------------
    getCardsInDeck: async (deckId: string): Promise<FlashcardItemDto[]> => {
        return callApi<FlashcardItemDto[]>(ApiRouters.FLASHCARD.DECK_CARDS(deckId), undefined, 'get');
    },

    getStudyCards: async (deckId: string, dueOnly: boolean = false): Promise<FlashcardItemDto[]> => {
        const url = `${ApiRouters.FLASHCARD.DECK_STUDY(deckId)}?dueOnly=${dueOnly}`;
        return callApi<FlashcardItemDto[]>(url, undefined, 'get');
    },

    createCard: async (data: CreateFlashcardItemRequest): Promise<FlashcardItemDto> => {
        return callApi<FlashcardItemDto>(ApiRouters.FLASHCARD.ITEMS, data, 'post');
    },

    updateCard: async (id: string, data: UpdateFlashcardItemRequest): Promise<FlashcardItemDto> => {
        return callApi<FlashcardItemDto>(ApiRouters.FLASHCARD.ITEM_BY_ID(id), data, 'put');
    },

    deleteCard: async (id: string): Promise<void> => {
        return callApi<void>(ApiRouters.FLASHCARD.ITEM_BY_ID(id), undefined, 'delete');
    },

    reviewCard: async (id: string, rating: number): Promise<FlashcardItemDto> => {
        return callApi<FlashcardItemDto>(ApiRouters.FLASHCARD.ITEM_REVIEW(id), { rating }, 'post');
    },

    // ----------------- AI Services -----------------
    enrichWord: async (
        word: string,
        context?: string,
        preferredModel?: string
    ): Promise<AiEnrichWordResponse> => {
        return callApi<AiEnrichWordResponse>(ApiRouters.FLASHCARD.AI_ENRICH, {
            word,
            context,
            preferredModel,
        }, 'post');
    },

    checkSentence: async (
        word: string,
        meaningVi: string,
        sentence: string,
        preferredModel?: string
    ): Promise<AiCheckSentenceResponse> => {
        return callApi<AiCheckSentenceResponse>(ApiRouters.FLASHCARD.AI_CHECK_SENTENCE, {
            word,
            meaningVi,
            sentence,
            preferredModel,
        }, 'post');
    },
};

// Alias for backward compatibility
export const flashcardApi = flashcardService;

