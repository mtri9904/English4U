import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { flashcardService } from '../services/flashcard.service';
import type {
    CreateDeckRequest,
    UpdateDeckRequest,
    CreateFlashcardItemRequest,
    UpdateFlashcardItemRequest,
} from '../types/flashcard.types';

/**
 * Flashcard Query Keys Factory
 * Matches the pattern from Mebifarm CMS (web)
 */
export const flashcardQueryKeys = {
    all: ['flashcards'] as const,
    decks: () => [...flashcardQueryKeys.all, 'decks'] as const,
    deckDetail: (id: string) => [...flashcardQueryKeys.decks(), id] as const,
    deckCards: (deckId: string) => [...flashcardQueryKeys.decks(), deckId, 'cards'] as const,
    studyCards: (deckId: string, dueOnly: boolean = false) =>
        [...flashcardQueryKeys.decks(), deckId, 'study', { dueOnly }] as const,
};

// Alias for backwards compatibility
export const flashcardKeys = {
    allDecks: flashcardQueryKeys.decks(),
    deckDetail: flashcardQueryKeys.deckDetail,
    deckCards: flashcardQueryKeys.deckCards,
    studyCards: flashcardQueryKeys.studyCards,
};

// ----------------- Queries -----------------

export const useFlashcardDecksQuery = () =>
    useQuery({
        queryKey: flashcardQueryKeys.decks(),
        queryFn: flashcardService.getDecks,
    });

export const useFlashcardDeckDetailQuery = (deckId: string) =>
    useQuery({
        queryKey: flashcardQueryKeys.deckDetail(deckId),
        queryFn: () => flashcardService.getDeckById(deckId),
        enabled: !!deckId,
    });

export const useDeckCardsQuery = (deckId: string) =>
    useQuery({
        queryKey: flashcardQueryKeys.deckCards(deckId),
        queryFn: () => flashcardService.getCardsInDeck(deckId),
        enabled: !!deckId,
    });

export const useStudyCardsQuery = (deckId: string, dueOnly: boolean = false) =>
    useQuery({
        queryKey: flashcardQueryKeys.studyCards(deckId, dueOnly),
        queryFn: () => flashcardService.getStudyCards(deckId, dueOnly),
        enabled: !!deckId,
    });

// ----------------- Mutations -----------------

export const useCreateDeckMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: CreateDeckRequest) => flashcardService.createDeck(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: flashcardQueryKeys.decks() });
        },
    });
};

export const useUpdateDeckMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: UpdateDeckRequest }) =>
            flashcardService.updateDeck(id, data),
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: flashcardQueryKeys.decks() });
            queryClient.invalidateQueries({ queryKey: flashcardQueryKeys.deckDetail(variables.id) });
        },
    });
};

export const useDeleteDeckMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => flashcardService.deleteDeck(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: flashcardQueryKeys.decks() });
        },
    });
};

export const useCreateCardMutation = (deckId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: CreateFlashcardItemRequest) => flashcardService.createCard(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: flashcardQueryKeys.deckCards(deckId) });
            queryClient.invalidateQueries({ queryKey: flashcardQueryKeys.decks() });
        },
    });
};

export const useUpdateCardMutation = (deckId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: UpdateFlashcardItemRequest }) =>
            flashcardService.updateCard(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: flashcardQueryKeys.deckCards(deckId) });
            queryClient.invalidateQueries({ queryKey: flashcardQueryKeys.decks() });
        },
    });
};

export const useDeleteCardMutation = (deckId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => flashcardService.deleteCard(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: flashcardQueryKeys.deckCards(deckId) });
            queryClient.invalidateQueries({ queryKey: flashcardQueryKeys.decks() });
        },
    });
};

export const useReviewCardMutation = (deckId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, rating }: { id: string; rating: number }) =>
            flashcardService.reviewCard(id, rating),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: flashcardQueryKeys.deckCards(deckId) });
            queryClient.invalidateQueries({ queryKey: flashcardQueryKeys.studyCards(deckId, false) });
            queryClient.invalidateQueries({ queryKey: flashcardQueryKeys.studyCards(deckId, true) });
            queryClient.invalidateQueries({ queryKey: flashcardQueryKeys.decks() });
        },
    });
};

