import React, { useEffect, useMemo, useRef, useState } from 'react';
import { message } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import {
    flashcardApi,
    flashcardKeys,
    useFlashcardDecksQuery,
} from '@/features/flashcard';
import type { AiEnrichWordResponse } from '@/features/flashcard/types/flashcard.types';
import { useTextSelectionFlashcard } from './flashcard/useTextSelectionFlashcard';
import { FlashcardQuickAddModal } from './flashcard/FlashcardQuickAddModal';

const EXAM_DECK_TITLE = 'Từ vựng bài thi';
const CREATE_EXAM_DECK_KEY = '__CREATE_EXAM_DECK__';

export const ReviewAddToFlashcard: React.FC = () => {
    const queryClient = useQueryClient();
    const { data: decks = [], isLoading: isLoadingDecks } = useFlashcardDecksQuery();

    // Modal State
    const [modalOpen, setModalOpen] = useState(false);
    const [activeWord, setActiveWord] = useState('');
    const [activeContext, setActiveContext] = useState('');
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [enrichedResult, setEnrichedResult] = useState<AiEnrichWordResponse | null>(null);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [isChangingImage, setIsChangingImage] = useState(false);
    const [selectedDeckId, setSelectedDeckId] = useState<string>(CREATE_EXAM_DECK_KEY);
    const [isSaving, setIsSaving] = useState(false);

    // New custom deck inline creation
    const [newDeckTitle, setNewDeckTitle] = useState('');
    const [isCreatingDeck, setIsCreatingDeck] = useState(false);

    const modalOpenRef = useRef(false);

    // Hook for handling text selection floating button
    const { floatingBtn, setFloatingBtn } = useTextSelectionFlashcard({ modalOpen });

    // Find default exam deck if exists
    const examDeck = useMemo(
        () => decks.find((d) => d.title.trim().toLowerCase() === EXAM_DECK_TITLE.toLowerCase()),
        [decks]
    );

    useEffect(() => {
        modalOpenRef.current = modalOpen;
    }, [modalOpen]);

    // Update selectedDeckId when decks change or modal opens
    useEffect(() => {
        if (!modalOpen) return;
        if (examDeck) {
            setSelectedDeckId(examDeck.id);
        } else {
            setSelectedDeckId(CREATE_EXAM_DECK_KEY);
        }
    }, [examDeck, modalOpen]);

    // Build options for Deck Select
    const deckOptions = useMemo(() => {
        const list: { label: string; value: string }[] = [];

        if (examDeck) {
            list.push({
                label: `📚 ${examDeck.title} (${examDeck.totalCards} từ) — Mặc định`,
                value: examDeck.id,
            });
        } else {
            list.push({
                label: `📚 ${EXAM_DECK_TITLE} (Mặc định - Sẽ tự động tạo)`,
                value: CREATE_EXAM_DECK_KEY,
            });
        }

        decks.forEach((deck) => {
            if (!examDeck || deck.id !== examDeck.id) {
                list.push({
                    label: `📘 ${deck.title} (${deck.totalCards} từ)`,
                    value: deck.id,
                });
            }
        });

        return list;
    }, [decks, examDeck]);

    // Speech audio playback
    const playSpeech = (text: string) => {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'en-US';
            utterance.rate = 0.9;
            window.speechSynthesis.speak(utterance);
        }
    };

    const playAudio = (text: string, audioUrl?: string) => {
        if (audioUrl) {
            try {
                const audio = new Audio(audioUrl);
                audio.play().catch(() => playSpeech(text));
                return;
            } catch {
                // fallback
            }
        }
        playSpeech(text);
    };

    // Trigger AI Enrichment
    const handleAiAnalyze = async (wordToAnalyze: string, contextToUse?: string) => {
        const clean = wordToAnalyze.trim();
        if (!clean) {
            message.warning('Vui lòng nhập từ vựng!');
            return;
        }

        try {
            setIsAiLoading(true);
            setEnrichedResult(null); // Clear previous result immediately
            const res = await flashcardApi.enrichWord(clean, contextToUse);
            setEnrichedResult(res);
            setCurrentImageIndex(0);

            // Preload next image if available
            if (res.candidateImages && res.candidateImages.length > 1) {
                const preload = new window.Image();
                preload.src = res.candidateImages[1];
            }

            message.success('AI đã phân tích ngữ cảnh bài thi và tra cứu thành công!');
        } catch {
            message.error('Không thể tra cứu thông tin từ vựng. Vui lòng thử lại.');
        } finally {
            setIsAiLoading(false);
        }
    };

    const handleCycleNextImage = () => {
        if (!enrichedResult) return;
        const candidates = enrichedResult.candidateImages && enrichedResult.candidateImages.length > 0
            ? enrichedResult.candidateImages
            : (enrichedResult.imageUrl ? [enrichedResult.imageUrl] : []);

        if (candidates.length <= 1) {
            message.info('Chỉ có 1 hình ảnh minh họa cho từ vựng này.');
            return;
        }

        try {
            setIsChangingImage(true);
            const current = enrichedResult.imageUrl || '';
            let currentIdx = candidates.indexOf(current);
            if (currentIdx === -1) {
                currentIdx = currentImageIndex;
            }
            const nextIdx = (currentIdx + 1) % candidates.length;
            const nextUrl = candidates[nextIdx];

            setCurrentImageIndex(nextIdx);
            setEnrichedResult({
                ...enrichedResult,
                imageUrl: nextUrl,
            });

            // Preload subsequent image in background
            const subsequentIdx = (nextIdx + 1) % candidates.length;
            if (subsequentIdx !== nextIdx) {
                const preload = new window.Image();
                preload.src = candidates[subsequentIdx];
            }

            message.success(`Đã đổi sang hình ${nextIdx + 1}/${candidates.length}!`);
        } finally {
            setIsChangingImage(false);
        }
    };

    // Open Modal when clicking the floating badge
    const handleOpenModal = (word: string, context: string) => {
        modalOpenRef.current = true;
        setFloatingBtn({ visible: false, x: 0, y: 0, word: '', context: '' });
        setActiveWord(word);
        setActiveContext(context);
        setEnrichedResult(null);
        setModalOpen(true);

        try {
            window.getSelection()?.removeAllRanges();
        } catch {
            // ignore
        }

        // Pre-select exam deck
        if (examDeck) {
            setSelectedDeckId(examDeck.id);
        } else {
            setSelectedDeckId(CREATE_EXAM_DECK_KEY);
        }

        // Auto trigger AI analyze
        handleAiAnalyze(word, context);
    };

    // Quick create custom deck inline in Select
    const handleQuickCreateDeck = async () => {
        if (!newDeckTitle.trim()) {
            message.warning('Vui lòng nhập tên bộ thẻ mới!');
            return;
        }

        try {
            setIsCreatingDeck(true);
            const deck = await flashcardApi.createDeck({
                title: newDeckTitle.trim(),
                description: 'Bộ thẻ tự tạo',
                color: '#0284c7',
                icon: '📚',
                isPublic: false,
            });
            await queryClient.invalidateQueries({ queryKey: flashcardKeys.allDecks });
            setSelectedDeckId(deck.id);
            setNewDeckTitle('');
            message.success(`Đã tạo bộ thẻ "${deck.title}"!`);
        } catch {
            message.error('Không thể tạo bộ thẻ mới.');
        } finally {
            setIsCreatingDeck(false);
        }
    };

    // Save Flashcard Item
    const handleSaveCard = async () => {
        if (!enrichedResult) return;

        try {
            setIsSaving(true);
            let targetDeckId = selectedDeckId;
            let targetDeckTitle = EXAM_DECK_TITLE;

            if (selectedDeckId === CREATE_EXAM_DECK_KEY) {
                // Auto create the default "Từ vựng bài thi" deck
                const newDeck = await flashcardApi.createDeck({
                    title: EXAM_DECK_TITLE,
                    description: 'Bộ thẻ từ vựng được lưu từ các bài thi',
                    color: '#4f46e5',
                    icon: '📝',
                    isPublic: false,
                });
                targetDeckId = newDeck.id;
                targetDeckTitle = newDeck.title;
            } else {
                const found = decks.find((d) => d.id === selectedDeckId);
                if (found) targetDeckTitle = found.title;
            }

            await flashcardApi.createCard({
                deckId: targetDeckId,
                word: enrichedResult.word,
                meaningVi: enrichedResult.meaningVi,
                phonetic: enrichedResult.phonetic,
                partOfSpeech: enrichedResult.partOfSpeech,
                definitionEn: enrichedResult.definitionEn,
                exampleSentence: enrichedResult.exampleSentence,
                exampleSentenceVi: enrichedResult.exampleSentenceVi,
                collocations: enrichedResult.collocations,
                imageUrl: enrichedResult.imageUrl,
                audioUrl: enrichedResult.audioUrl,
                quizDistractors: enrichedResult.quizDistractors,
                contextNote: activeContext ? `Trích từ bài thi: ${activeContext}` : undefined,
            });

            message.success(`Đã thêm từ "${enrichedResult.word}" vào bộ thẻ "${targetDeckTitle}" thành công!`);
            queryClient.invalidateQueries({ queryKey: flashcardKeys.allDecks });
            queryClient.invalidateQueries({ queryKey: flashcardKeys.deckCards(targetDeckId) });
            modalOpenRef.current = false;
            setModalOpen(false);
            setEnrichedResult(null);
        } catch {
            message.error('Không thể lưu từ vào bộ thẻ. Vui lòng thử lại.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <>
            <style>{`
                @keyframes flashcardFloatIn {
                    from {
                        opacity: 0;
                        transform: translateX(-50%) translateY(6px) scale(0.92);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(-50%) translateY(0) scale(1);
                    }
                }
                .review-flashcard-floating-btn {
                    animation: flashcardFloatIn 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }
                .review-flashcard-floating-btn:hover {
                    transform: translateX(-50%) scale(1.05) !important;
                    box-shadow: 0 12px 28px rgba(79, 70, 229, 0.5), 0 4px 12px rgba(0, 0, 0, 0.25) !important;
                }
                .review-flashcard-floating-btn:active {
                    transform: translateX(-50%) scale(0.97) !important;
                }
            `}</style>

            {/* Floating Action Badge on text selection */}
            {!modalOpen && floatingBtn.visible && (
                <div
                    data-review-flashcard-floating-btn="true"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    }}
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleOpenModal(floatingBtn.word, floatingBtn.context);
                    }}
                    style={{
                        position: 'fixed',
                        top: floatingBtn.y,
                        left: floatingBtn.x,
                        transform: 'translateX(-50%)',
                        zIndex: 99999,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 14px',
                        borderRadius: 999,
                        background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 50%, #4f46e5 100%)',
                        color: '#fff',
                        fontSize: '13px',
                        fontWeight: 700,
                        boxShadow: '0 8px 24px rgba(59, 130, 246, 0.4), 0 2px 8px rgba(0, 0, 0, 0.2)',
                        border: '1.5px solid rgba(255, 255, 255, 0.35)',
                        backdropFilter: 'blur(8px)',
                        cursor: 'pointer',
                        userSelect: 'none',
                        whiteSpace: 'nowrap',
                        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                    }}
                    className="review-flashcard-floating-btn"
                >
                    <span style={{ fontSize: '15px' }}>✨</span>
                    <span>Thêm vào Flashcard</span>
                </div>
            )}

            {/* AI Quick Add Flashcard Modal */}
            <FlashcardQuickAddModal
                open={modalOpen}
                activeWord={activeWord}
                activeContext={activeContext}
                selectedDeckId={selectedDeckId}
                decks={decks}
                isLoadingDecks={isLoadingDecks}
                deckOptions={deckOptions}
                newDeckTitle={newDeckTitle}
                isCreatingDeck={isCreatingDeck}
                isAiLoading={isAiLoading}
                enrichedResult={enrichedResult}
                currentImageIndex={currentImageIndex}
                isChangingImage={isChangingImage}
                isSaving={isSaving}
                onClose={() => {
                    modalOpenRef.current = false;
                    setModalOpen(false);
                }}
                onChangeWord={setActiveWord}
                onAiAnalyze={handleAiAnalyze}
                onChangeSelectedDeck={setSelectedDeckId}
                onChangeNewDeckTitle={setNewDeckTitle}
                onQuickCreateDeck={handleQuickCreateDeck}
                onCycleNextImage={handleCycleNextImage}
                onUpdateMeaningVi={(val) => {
                    if (enrichedResult) {
                        setEnrichedResult({ ...enrichedResult, meaningVi: val });
                    }
                }}
                onPlayAudio={playAudio}
                onSaveCard={handleSaveCard}
            />
        </>
    );
};
