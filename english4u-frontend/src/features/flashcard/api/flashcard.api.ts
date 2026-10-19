import { axiosInstance } from '@/apis/axios.instance';
import { useQuery } from '@tanstack/react-query';
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

export const flashcardKeys = {
    allDecks: ['flashcards', 'decks'] as const,
    deckDetail: (id: string) => ['flashcards', 'decks', id] as const,
    deckCards: (deckId: string) => ['flashcards', 'decks', deckId, 'cards'] as const,
    studyCards: (deckId: string, dueOnly: boolean) => ['flashcards', 'decks', deckId, 'study', { dueOnly }] as const,
};

export const flashcardApi = {
    // Decks
    getDecks: async (): Promise<FlashcardDeckDto[]> => {
        const response = await axiosInstance.get<FlashcardDeckDto[]>('/flashcard/decks');
        return response.data;
    },
    getDeckById: async (id: string): Promise<FlashcardDeckDto> => {
        const response = await axiosInstance.get<FlashcardDeckDto>(`/flashcard/decks/${id}`);
        return response.data;
    },
    createDeck: async (data: CreateDeckRequest): Promise<FlashcardDeckDto> => {
        const response = await axiosInstance.post<FlashcardDeckDto>('/flashcard/decks', data);
        return response.data;
    },
    updateDeck: async (id: string, data: UpdateDeckRequest): Promise<FlashcardDeckDto> => {
        const response = await axiosInstance.put<FlashcardDeckDto>(`/flashcard/decks/${id}`, data);
        return response.data;
    },
    deleteDeck: async (id: string): Promise<void> => {
        await axiosInstance.delete(`/flashcard/decks/${id}`);
    },

    // Cards
    getCardsInDeck: async (deckId: string): Promise<FlashcardItemDto[]> => {
        const response = await axiosInstance.get<FlashcardItemDto[]>(`/flashcard/decks/${deckId}/cards`);
        return response.data;
    },
    getStudyCards: async (deckId: string, dueOnly: boolean = false): Promise<FlashcardItemDto[]> => {
        const response = await axiosInstance.get<FlashcardItemDto[]>(`/flashcard/decks/${deckId}/study?dueOnly=${dueOnly}`);
        return response.data;
    },
    createCard: async (data: CreateFlashcardItemRequest): Promise<FlashcardItemDto> => {
        const response = await axiosInstance.post<FlashcardItemDto>('/flashcard/items', data);
        return response.data;
    },
    updateCard: async (id: string, data: UpdateFlashcardItemRequest): Promise<FlashcardItemDto> => {
        const response = await axiosInstance.put<FlashcardItemDto>(`/flashcard/items/${id}`, data);
        return response.data;
    },
    deleteCard: async (id: string): Promise<void> => {
        await axiosInstance.delete(`/flashcard/items/${id}`);
    },
    reviewCard: async (id: string, rating: number): Promise<FlashcardItemDto> => {
        const response = await axiosInstance.post<FlashcardItemDto>(`/flashcard/items/${id}/review`, { rating });
        return response.data;
    },

    // AI
    enrichWord: async (word: string, context?: string, preferredModel?: string): Promise<AiEnrichWordResponse> => {
        const response = await axiosInstance.post<AiEnrichWordResponse>('/flashcard/ai/enrich', { word, context, preferredModel });
        return response.data;
    },
    checkSentence: async (word: string, meaningVi: string, sentence: string, preferredModel?: string): Promise<AiCheckSentenceResponse> => {
        const response = await axiosInstance.post<AiCheckSentenceResponse>('/flashcard/ai/check-sentence', {
            word,
            meaningVi,
            sentence,
            preferredModel,
        });
        return response.data;
    },
};

// Hooks
export const useFlashcardDecksQuery = () =>
    useQuery({
        queryKey: flashcardKeys.allDecks,
        queryFn: flashcardApi.getDecks,
    });

export const useFlashcardDeckDetailQuery = (deckId: string) =>
    useQuery({
        queryKey: flashcardKeys.deckDetail(deckId),
        queryFn: () => flashcardApi.getDeckById(deckId),
        enabled: !!deckId,
    });

export const useDeckCardsQuery = (deckId: string) =>
    useQuery({
        queryKey: flashcardKeys.deckCards(deckId),
        queryFn: () => flashcardApi.getCardsInDeck(deckId),
        enabled: !!deckId,
    });

export const useStudyCardsQuery = (deckId: string, dueOnly: boolean = false) =>
    useQuery({
        queryKey: flashcardKeys.studyCards(deckId, dueOnly),
        queryFn: () => flashcardApi.getStudyCards(deckId, dueOnly),
        enabled: !!deckId,
    });
