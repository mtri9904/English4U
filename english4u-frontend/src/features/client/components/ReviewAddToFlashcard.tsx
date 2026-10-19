import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Button,
    Card,
    Divider,
    Input,
    Modal,
    Select,
    Space,
    Spin,
    Tag,
    Typography,
    message,
} from 'antd';
import {
    BulbOutlined,
    LoadingOutlined,
    PlusOutlined,
    SoundOutlined,
} from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import {
    flashcardApi,
    flashcardKeys,
    useFlashcardDecksQuery,
} from '@/features/flashcard/api/flashcard.api';
import type { AiEnrichWordResponse } from '@/features/flashcard/types/flashcard.types';

const { Text } = Typography;

const EXAM_DECK_TITLE = 'Từ vựng bài thi';
const CREATE_EXAM_DECK_KEY = '__CREATE_EXAM_DECK__';

export const ReviewAddToFlashcard: React.FC = () => {
    const queryClient = useQueryClient();
    const { data: decks = [], isLoading: isLoadingDecks } = useFlashcardDecksQuery();

    // Floating Button State
    const [floatingBtn, setFloatingBtn] = useState<{
        visible: boolean;
        x: number;
        y: number;
        word: string;
        context: string;
    }>({
        visible: false,
        x: 0,
        y: 0,
        word: '',
        context: '',
    });

    // Modal State
    const [modalOpen, setModalOpen] = useState(false);
    const [activeWord, setActiveWord] = useState('');
    const [activeContext, setActiveContext] = useState('');
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [enrichedResult, setEnrichedResult] = useState<AiEnrichWordResponse | null>(null);
    const [selectedDeckId, setSelectedDeckId] = useState<string>(CREATE_EXAM_DECK_KEY);
    const [isSaving, setIsSaving] = useState(false);

    // New custom deck inline creation
    const [newDeckTitle, setNewDeckTitle] = useState('');
    const [isCreatingDeck, setIsCreatingDeck] = useState(false);

    const isSelectingRef = useRef(false);
    const modalOpenRef = useRef(false);

    // Find default exam deck if exists
    const examDeck = useMemo(
        () => decks.find((d) => d.title.trim().toLowerCase() === EXAM_DECK_TITLE.toLowerCase()),
        [decks]
    );

    useEffect(() => {
        modalOpenRef.current = modalOpen;
        if (modalOpen) {
            setFloatingBtn((prev) => (prev.visible ? { ...prev, visible: false } : prev));
        }
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

    // Text selection listener
    useEffect(() => {
        const handleSelectionCheck = () => {
            if (modalOpenRef.current || modalOpen) {
                setFloatingBtn((prev) => (prev.visible ? { ...prev, visible: false } : prev));
                return;
            }

            const selection = window.getSelection();
            if (!selection || selection.isCollapsed) {
                return;
            }

            const rawText = selection.toString();
            // Clean up whitespaces
            const text = rawText.replace(/[ \t\r\n]+/g, ' ').trim();

            // Strip leading and trailing non-alphanumeric punctuation
            const cleanWord = text.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '').trim();

            // Conditions:
            // 1. Length between 2 and 60 chars
            if (cleanWord.length < 2 || cleanWord.length > 60) {
                return;
            }

            // 2. Must contain English letters
            if (!/[a-zA-Z]/.test(cleanWord)) {
                return;
            }

            // 3. Avoid selection within form inputs, editable areas, modals, or copilot drawer
            const anchor = selection.anchorNode;
            const anchorEl = anchor instanceof Element ? anchor : anchor?.parentElement;
            if (anchorEl?.closest('input, textarea, [contenteditable="true"], .ant-modal, .ant-drawer, [data-copilot-drawer-root="true"]')) {
                return;
            }

            try {
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                if (rect.width === 0 && rect.height === 0) {
                    return;
                }

                // Extract sentence context
                let context = '';
                const blockEl = anchorEl?.closest('p, div, li, span, td, h1, h2, h3, h4, h5, h6') || anchorEl;
                const parentText = blockEl?.textContent?.replace(/\s+/g, ' ').trim() || '';
                if (parentText) {
                    const sentences = parentText.split(/(?<=[.!?])\s+/);
                    const matched = sentences.find((s) => s.toLowerCase().includes(cleanWord.toLowerCase()));
                    context = (matched || parentText).slice(0, 300).trim();
                }

                // Positioning
                let top = rect.top - 46;
                if (top < 12) {
                    top = rect.bottom + 10;
                }
                let left = rect.left + rect.width / 2;
                left = Math.max(120, Math.min(window.innerWidth - 120, left));

                setFloatingBtn({
                    visible: true,
                    x: left,
                    y: top,
                    word: cleanWord,
                    context,
                });
            } catch {
                // ignore
            }
        };

        const handlePointerDown = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.closest('[data-review-flashcard-floating-btn="true"]')) {
                return;
            }
            isSelectingRef.current = true;
            setFloatingBtn((prev) => (prev.visible ? { ...prev, visible: false } : prev));
        };

        const handleMouseUp = () => {
            isSelectingRef.current = false;
            // Delay slightly to let browser selection finalize
            window.setTimeout(handleSelectionCheck, 30);
        };

        const handleScroll = () => {
            setFloatingBtn((prev) => (prev.visible ? { ...prev, visible: false } : prev));
        };

        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('mouseup', handleMouseUp);
        window.addEventListener('scroll', handleScroll, { passive: true });

        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('scroll', handleScroll);
        };
    }, [modalOpen]);

    // Trigger AI Enrichment
    const handleAiAnalyze = async (wordToAnalyze: string, contextToUse?: string) => {
        const clean = wordToAnalyze.trim();
        if (!clean) {
            message.warning('Vui lòng nhập từ vựng!');
            return;
        }

        try {
            setIsAiLoading(true);
            const res = await flashcardApi.enrichWord(clean, contextToUse);
            setEnrichedResult(res);
            message.success('AI đã phân tích ngữ cảnh bài thi và tra cứu thành công!');
        } catch {
            message.error('Không thể tra cứu thông tin từ vựng. Vui lòng thử lại.');
        } finally {
            setIsAiLoading(false);
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
            <Modal
                title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                            style={{
                                width: 36,
                                height: 36,
                                borderRadius: 10,
                                background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#fff',
                                fontSize: 18,
                            }}
                        >
                            <BulbOutlined />
                        </div>
                        <div>
                            <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#0f172a' }}>
                                Thêm nhanh vào Flashcard bằng AI
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                Tự động tra cứu nghĩa theo ngữ cảnh bài thi, IPA và tạo ảnh 3D
                            </div>
                        </div>
                    </div>
                }
                open={modalOpen}
                onCancel={() => {
                    modalOpenRef.current = false;
                    setModalOpen(false);
                    setEnrichedResult(null);
                }}
                footer={null}
                width={650}
                destroyOnClose
            >
                <div style={{ marginTop: 12 }}>
                    {/* Word Input */}
                    <div style={{ marginBottom: 16 }}>
                        <Text strong style={{ display: 'block', marginBottom: 6, color: '#334155' }}>
                            Từ vựng hoặc cụm từ tiếng Anh:
                        </Text>
                        <Input
                            size="large"
                            value={activeWord}
                            onChange={(e) => setActiveWord(e.target.value)}
                            placeholder="Ví dụ: ubiquitous, ameliorate, environmentally friendly..."
                            suffix={
                                <Button
                                    type="primary"
                                    icon={<BulbOutlined />}
                                    loading={isAiLoading}
                                    onClick={() => handleAiAnalyze(activeWord, activeContext)}
                                    style={{ borderRadius: 8, background: '#4f46e5' }}
                                >
                                    AI Phân tích
                                </Button>
                            }
                            onPressEnter={() => handleAiAnalyze(activeWord, activeContext)}
                        />
                        {activeContext && (
                            <div
                                style={{
                                    marginTop: 8,
                                    padding: '6px 12px',
                                    background: '#f8fafc',
                                    borderRadius: 8,
                                    fontSize: '0.8rem',
                                    color: '#475569',
                                    border: '1px solid #e2e8f0',
                                }}
                            >
                                <span style={{ fontWeight: 600, color: '#1e293b' }}>📌 Ngữ cảnh bài thi:</span>{' '}
                                <em>"{activeContext}"</em>
                            </div>
                        )}
                    </div>

                    {/* Target Deck Select */}
                    <div style={{ marginBottom: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <Text strong style={{ color: '#334155' }}>
                                Lưu vào bộ thẻ:
                            </Text>
                            {decks.length > 1 && (
                                <Tag color="blue" style={{ borderRadius: 999, fontSize: '0.75rem' }}>
                                    Đang có {decks.length} bộ thẻ
                                </Tag>
                            )}
                        </div>
                        <Select
                            size="large"
                            style={{ width: '100%' }}
                            value={selectedDeckId}
                            onChange={setSelectedDeckId}
                            loading={isLoadingDecks}
                            options={deckOptions}
                            dropdownRender={(menu) => (
                                <>
                                    {menu}
                                    <Divider style={{ margin: '8px 0' }} />
                                    <Space style={{ padding: '0 8px 6px' }}>
                                        <Input
                                            placeholder="Tên bộ thẻ mới..."
                                            value={newDeckTitle}
                                            onChange={(e) => setNewDeckTitle(e.target.value)}
                                            onKeyDown={(e) => e.stopPropagation()}
                                            style={{ width: 220 }}
                                        />
                                        <Button
                                            type="primary"
                                            icon={<PlusOutlined />}
                                            loading={isCreatingDeck}
                                            onClick={handleQuickCreateDeck}
                                            style={{ background: '#0284c7' }}
                                        >
                                            Tạo bộ thẻ
                                        </Button>
                                    </Space>
                                </>
                            )}
                        />
                    </div>

                    {/* AI Loading State */}
                    {isAiLoading && (
                        <div
                            style={{
                                textAlign: 'center',
                                padding: '36px 0',
                                background: '#f8fafc',
                                borderRadius: 16,
                                border: '1px dashed #cbd5e1',
                                marginTop: 12,
                            }}
                        >
                            <Spin indicator={<LoadingOutlined style={{ fontSize: 32, color: '#4f46e5' }} spin />} />
                            <div style={{ marginTop: 12, color: '#4f46e5', fontWeight: 600, fontSize: '0.95rem' }}>
                                AI đang tra cứu phiên âm, dịch nghĩa theo ngữ cảnh và vẽ ảnh minh họa 3D...
                            </div>
                        </div>
                    )}

                    {/* Preview Result Card */}
                    {enrichedResult && !isAiLoading && (
                        <Card
                            style={{
                                marginTop: 16,
                                borderRadius: 16,
                                background: '#f8fafc',
                                border: '1px solid #cbd5e1',
                                overflow: 'hidden',
                            }}
                        >
                            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                                {enrichedResult.imageUrl && (
                                    <img
                                        src={enrichedResult.imageUrl}
                                        alt={enrichedResult.word}
                                        style={{
                                            width: 140,
                                            height: 110,
                                            borderRadius: 12,
                                            objectFit: 'cover',
                                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                            border: '1px solid #e2e8f0',
                                            flexShrink: 0,
                                        }}
                                    />
                                )}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                                        <Text strong style={{ fontSize: '1.25rem', color: '#0f172a' }}>
                                            {enrichedResult.word}
                                        </Text>
                                        {enrichedResult.partOfSpeech && (
                                            <Tag color="blue">{enrichedResult.partOfSpeech}</Tag>
                                        )}
                                        <Button
                                            type="text"
                                            size="small"
                                            icon={<SoundOutlined style={{ color: '#2563eb' }} />}
                                            onClick={() => playAudio(enrichedResult.word, enrichedResult.audioUrl)}
                                        />
                                    </div>
                                    {enrichedResult.phonetic && (
                                        <div style={{ color: '#64748b', fontStyle: 'italic', marginBottom: 6 }}>
                                            {enrichedResult.phonetic}
                                        </div>
                                    )}
                                    <div style={{ margin: '8px 0 10px' }}>
                                        <Text strong style={{ color: '#16a34a', display: 'block', fontSize: '0.85rem', marginBottom: 2 }}>
                                            👉 Nghĩa tiếng Việt (AI gợi ý theo ngữ cảnh):
                                        </Text>
                                        <Input
                                            value={enrichedResult.meaningVi}
                                            onChange={(e) => setEnrichedResult({ ...enrichedResult, meaningVi: e.target.value })}
                                            placeholder="Nghĩa tiếng Việt..."
                                            style={{ borderRadius: 8, fontWeight: 600, color: '#15803d', borderColor: '#86efac' }}
                                        />
                                    </div>
                                    {enrichedResult.exampleSentence && (
                                        <div style={{ fontSize: '0.85rem', color: '#475569', marginBottom: 4 }}>
                                            <strong>Ví dụ:</strong> {enrichedResult.exampleSentence}
                                        </div>
                                    )}
                                    {enrichedResult.exampleSentenceVi && (
                                        <div style={{ fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic', marginBottom: 4 }}>
                                            <strong>Dịch:</strong> {enrichedResult.exampleSentenceVi}
                                        </div>
                                    )}
                                    {enrichedResult.collocations && (
                                        <div style={{ fontSize: '0.8rem', color: '#9333ea', marginBottom: 4 }}>
                                            <strong>Collocations:</strong> {enrichedResult.collocations}
                                        </div>
                                    )}
                                    {enrichedResult.quizDistractors && (
                                        <div style={{ fontSize: '0.8rem', color: '#d97706', marginTop: 4 }}>
                                            <strong>🎯 Đáp án trắc nghiệm nhiễu (Quiz):</strong>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                                                {enrichedResult.quizDistractors.split('|').map((d, idx) => (
                                                    <Tag key={idx} color="orange" style={{ borderRadius: 6, fontSize: '0.75rem' }}>
                                                        {d.trim()}
                                                    </Tag>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12 }}>
                                <Button
                                    size="large"
                                    onClick={() => {
                                        modalOpenRef.current = false;
                                        setModalOpen(false);
                                    }}
                                    style={{
                                        borderRadius: 10,
                                        height: 42,
                                        paddingInline: 22,
                                        fontWeight: 600,
                                        fontSize: '0.95rem',
                                        color: '#475569',
                                        borderColor: '#cbd5e1',
                                    }}
                                >
                                    Hủy
                                </Button>
                                <Button
                                    type="primary"
                                    size="large"
                                    icon={<PlusOutlined />}
                                    loading={isSaving}
                                    onClick={handleSaveCard}
                                    style={{
                                        borderRadius: 10,
                                        height: 42,
                                        paddingInline: 22,
                                        fontWeight: 700,
                                        fontSize: '0.95rem',
                                        background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
                                        border: 'none',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 6,
                                    }}
                                >
                                    Lưu ngay vào bộ thẻ
                                </Button>
                            </div>
                        </Card>
                    )}
                </div>
            </Modal>
        </>
    );
};
