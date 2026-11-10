import { useState, useMemo, useEffect, useCallback } from 'react';
import { message } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import {
    flashcardApi,
    flashcardKeys,
    useFlashcardDecksQuery,
} from '@/features/flashcard';
import type { AiEnrichWordResponse } from '@/features/flashcard/types/flashcard.types';

export const NEWS_DECK_TITLE = '📰 Từ vựng Báo The Guardian';
export const CREATE_NEWS_DECK_KEY = '__CREATE_NEWS_DECK__';

export function useNewsFlashcardQuickAdd() {
    const queryClient = useQueryClient();
    const { data: decks = [], isLoading: isLoadingDecks } = useFlashcardDecksQuery();

    const [flashcardModalOpen, setFlashcardModalOpen] = useState(false);
    const [fcWord, setFcWord] = useState('');
    const [fcContext, setFcContext] = useState('');
    const [fcAiLoading, setFcAiLoading] = useState(false);
    const [fcEnrichedResult, setFcEnrichedResult] = useState<AiEnrichWordResponse | null>(null);
    const [fcCurrentImageIndex, setFcCurrentImageIndex] = useState(0);
    const [fcIsChangingImage, setFcIsChangingImage] = useState(false);
    const [fcSelectedDeckId, setFcSelectedDeckId] = useState<string>(CREATE_NEWS_DECK_KEY);
    const [fcIsSaving, setFcIsSaving] = useState(false);
    const [fcNewDeckTitle, setFcNewDeckTitle] = useState('');
    const [fcIsCreatingDeck, setFcIsCreatingDeck] = useState(false);

    // Find default news deck if exists
    const newsDeck = useMemo(
        () => decks.find((d) => d.title.toLowerCase().includes('guardian')),
        [decks]
    );

    // Set initial deck selection
    useEffect(() => {
        if (!flashcardModalOpen) return;
        if (newsDeck) {
            setFcSelectedDeckId(newsDeck.id);
        } else {
            setFcSelectedDeckId(CREATE_NEWS_DECK_KEY);
        }
    }, [newsDeck, flashcardModalOpen]);

    // Build deck options for FlashcardQuickAddModal
    const deckOptions = useMemo(() => {
        const list: { label: string; value: string }[] = [];
        if (newsDeck) {
            list.push({
                label: `${newsDeck.title} (${newsDeck.totalCards} từ) — Mặc định`,
                value: newsDeck.id,
            });
        } else {
            list.push({
                label: `${NEWS_DECK_TITLE} (Mặc định - Tự động tạo)`,
                value: CREATE_NEWS_DECK_KEY,
            });
        }

        decks.forEach((deck) => {
            if (!newsDeck || deck.id !== newsDeck.id) {
                list.push({
                    label: `${deck.title} (${deck.totalCards} từ)`,
                    value: deck.id,
                });
            }
        });

        return list;
    }, [decks, newsDeck]);

    // Trigger AI Enrichment for word
    const handleAiAnalyze = useCallback(async (wordToAnalyze: string, contextToUse?: string) => {
        const clean = wordToAnalyze.trim();
        if (!clean) {
            message.warning('Vui lòng nhập từ vựng!');
            return;
        }

        try {
            setFcAiLoading(true);
            setFcEnrichedResult(null);
            const res = await flashcardApi.enrichWord(clean, contextToUse);
            setFcEnrichedResult(res);
            setFcCurrentImageIndex(0);
            message.success('AI đã phân tích ngữ cảnh bài báo và tra cứu thành công!');
        } catch {
            message.error('Không thể tra cứu thông tin từ vựng. Vui lòng thử lại.');
        } finally {
            setFcAiLoading(false);
        }
    }, []);

    // Open Flashcard Modal
    const handleOpenFlashcardModal = useCallback(
        (word: string, context: string) => {
            setFcWord(word);
            setFcContext(context);
            setFcEnrichedResult(null);
            setFlashcardModalOpen(true);

            if (newsDeck) {
                setFcSelectedDeckId(newsDeck.id);
            } else {
                setFcSelectedDeckId(CREATE_NEWS_DECK_KEY);
            }

            handleAiAnalyze(word, context);
        },
        [handleAiAnalyze, newsDeck]
    );

    const handleCloseFlashcardModal = useCallback(() => {
        setFlashcardModalOpen(false);
        setFcEnrichedResult(null);
    }, []);

    const handleCycleNextImage = useCallback(() => {
        if (!fcEnrichedResult) return;
        const candidates =
            fcEnrichedResult.candidateImages && fcEnrichedResult.candidateImages.length > 0
                ? fcEnrichedResult.candidateImages
                : fcEnrichedResult.imageUrl
                ? [fcEnrichedResult.imageUrl]
                : [];

        if (candidates.length <= 1) {
            message.info('Chỉ có 1 hình ảnh minh họa cho từ vựng này.');
            return;
        }

        try {
            setFcIsChangingImage(true);
            const current = fcEnrichedResult.imageUrl || '';
            let currentIdx = candidates.indexOf(current);
            if (currentIdx === -1) {
                currentIdx = fcCurrentImageIndex;
            }
            const nextIdx = (currentIdx + 1) % candidates.length;
            const nextUrl = candidates[nextIdx];

            setFcCurrentImageIndex(nextIdx);
            setFcEnrichedResult({
                ...fcEnrichedResult,
                imageUrl: nextUrl,
            });

            message.success(`Đã đổi sang hình ${nextIdx + 1}/${candidates.length}!`);
        } finally {
            setFcIsChangingImage(false);
        }
    }, [fcCurrentImageIndex, fcEnrichedResult]);

    const handleQuickCreateDeck = useCallback(async () => {
        if (!fcNewDeckTitle.trim()) {
            message.warning('Vui lòng nhập tên bộ thẻ mới!');
            return;
        }

        try {
            setFcIsCreatingDeck(true);
            const deck = await flashcardApi.createDeck({
                title: fcNewDeckTitle.trim(),
                description: 'Bộ thẻ tự tạo từ tin tức The Guardian',
                color: '#0284c7',
                icon: '📚',
                isPublic: false,
            });
            await queryClient.invalidateQueries({ queryKey: flashcardKeys.allDecks });
            setFcSelectedDeckId(deck.id);
            setFcNewDeckTitle('');
            message.success(`Đã tạo bộ thẻ "${deck.title}"!`);
        } catch {
            message.error('Không thể tạo bộ thẻ mới.');
        } finally {
            setFcIsCreatingDeck(false);
        }
    }, [fcNewDeckTitle, queryClient]);

    const handleSaveCard = useCallback(async () => {
        if (!fcEnrichedResult) return;

        try {
            setFcIsSaving(true);
            let targetDeckId = fcSelectedDeckId;
            let targetDeckTitle = NEWS_DECK_TITLE;

            if (fcSelectedDeckId === CREATE_NEWS_DECK_KEY) {
                const newDeck = await flashcardApi.createDeck({
                    title: NEWS_DECK_TITLE,
                    description: 'Bộ thẻ từ vựng lưu từ báo quốc tế The Guardian (UK)',
                    color: '#0284c7',
                    icon: '📰',
                    isPublic: false,
                });
                targetDeckId = newDeck.id;
                targetDeckTitle = newDeck.title;
            } else {
                const found = decks.find((d) => d.id === fcSelectedDeckId);
                if (found) targetDeckTitle = found.title;
            }

            await flashcardApi.createCard({
                deckId: targetDeckId,
                word: fcEnrichedResult.word,
                meaningVi: fcEnrichedResult.meaningVi,
                phonetic: fcEnrichedResult.phonetic,
                partOfSpeech: fcEnrichedResult.partOfSpeech,
                definitionEn: fcEnrichedResult.definitionEn,
                exampleSentence: fcEnrichedResult.exampleSentence,
                exampleSentenceVi: fcEnrichedResult.exampleSentenceVi,
                collocations: fcEnrichedResult.collocations,
                imageUrl: fcEnrichedResult.imageUrl,
                audioUrl: fcEnrichedResult.audioUrl,
                quizDistractors: fcEnrichedResult.quizDistractors,
                contextNote: fcContext ? `Trích từ báo The Guardian: ${fcContext}` : undefined,
            });

            message.success(`Đã thêm từ "${fcEnrichedResult.word}" vào bộ thẻ "${targetDeckTitle}"!`);
            queryClient.invalidateQueries({ queryKey: flashcardKeys.allDecks });
            queryClient.invalidateQueries({ queryKey: flashcardKeys.deckCards(targetDeckId) });
            setFlashcardModalOpen(false);
            setFcEnrichedResult(null);
        } catch {
            message.error('Không thể lưu từ vào bộ thẻ. Vui lòng thử lại.');
        } finally {
            setFcIsSaving(false);
        }
    }, [decks, fcContext, fcEnrichedResult, fcSelectedDeckId, queryClient]);

    return {
        decks,
        isLoadingDecks,
        deckOptions,
        flashcardModalOpen,
        fcWord,
        setFcWord,
        fcContext,
        fcAiLoading,
        fcEnrichedResult,
        setFcEnrichedResult,
        fcCurrentImageIndex,
        fcIsChangingImage,
        fcSelectedDeckId,
        setFcSelectedDeckId,
        fcIsSaving,
        fcNewDeckTitle,
        setFcNewDeckTitle,
        fcIsCreatingDeck,
        handleOpenFlashcardModal,
        handleCloseFlashcardModal,
        handleAiAnalyze,
        handleCycleNextImage,
        handleQuickCreateDeck,
        handleSaveCard,
    };
}

