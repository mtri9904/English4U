import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Modal, Spin, message } from 'antd';
import type { NewsItem } from '../types/news.types';
import {
    NEWS_CATEGORIES,
    fetchArticleDetail,
    translateParagraph,
} from '../services/news.service';
import { FlashcardQuickAddModal } from '@/features/exam-taking/components/flashcard/FlashcardQuickAddModal';
import { useNewsSpeech, useNewsWordLookup, useNewsFlashcardQuickAdd } from '../hooks';
import {
    NewsDetailHeader,
    NewsSpeechControlBar,
    NewsParagraphItem,
    NewsWordLookupPopover,
    NewsDetailFooter,
    NewsModalStyles,
} from './modal';

export interface NewsDetailModalProps {
    item: NewsItem | null;
    open: boolean;
    onClose: () => void;
}

export const NewsDetailModal: React.FC<NewsDetailModalProps> = ({ item, open, onClose }) => {
    const [fullArticle, setFullArticle] = useState<NewsItem | null>(null);
    const [isLoadingFull, setIsLoadingFull] = useState<boolean>(false);
    const [fontSizeLevel, setFontSizeLevel] = useState<'normal' | 'large' | 'xlarge'>('normal');

    // Paragraph translation states
    const [translatedParagraphs, setTranslatedParagraphs] = useState<Record<number, string>>({});
    const [translatingParagraphs, setTranslatingParagraphs] = useState<Record<number, boolean>>({});
    const [openedParagraphs, setOpenedParagraphs] = useState<Record<number, boolean>>({});

    const displayItem = fullArticle || item;
    const categoryMeta =
        displayItem ? NEWS_CATEGORIES.find((c) => c.key === displayItem.category) || NEWS_CATEGORIES[0] : NEWS_CATEGORIES[0];

    // 1. Text-to-Speech Hook
    const {
        isSpeaking,
        isPaused,
        speechRate,
        setSpeechRate,
        playSpeech,
        handleToggleSpeech,
        handleStopSpeech,
    } = useNewsSpeech({ open, displayItem });

    // 2. Word Lookup Popover Hook (Free Dictionary API + AI)
    const {
        activeWordLookup,
        lookupPopoverRef,
        handleParagraphClick,
        closeWordLookup,
    } = useNewsWordLookup(open);

    // 3. Flashcard Quick Add Hook (AI enrich & Deck sync)
    const {
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
    } = useNewsFlashcardQuickAdd();

    // Fetch full article detail if needed
    useEffect(() => {
        if (open && item) {
            setFullArticle(item);
            setTranslatedParagraphs({});
            setTranslatingParagraphs({});
            setOpenedParagraphs({});

            if (!item.bodyHtml || item.bodyHtml.length < 300) {
                setIsLoadingFull(true);
                fetchArticleDetail(item.id)
                    .then((detail) => {
                        if (detail) {
                            setFullArticle(detail);
                        }
                    })
                    .finally(() => {
                        setIsLoadingFull(false);
                    });
            }
        }
    }, [open, item]);

    // Parse HTML content into structured segments (paragraphs, figures, etc.)
    const articleBlocks = useMemo(() => {
        if (!displayItem) return [];
        const raw = displayItem.bodyHtml || `<p>${displayItem.description}</p>`;
        const doc = new DOMParser().parseFromString(raw, 'text/html');
        const nodes = Array.from(doc.body.childNodes);
        const parsed: Array<{
            id: number;
            tagName: string;
            isParagraph: boolean;
            html: string;
            text: string;
        }> = [];

        let pIndex = 0;
        nodes.forEach((node, idx) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node as HTMLElement;
                const isP = el.tagName.toUpperCase() === 'P';
                const text = el.textContent?.trim() || '';

                if (isP && text) {
                    pIndex++;
                    parsed.push({
                        id: pIndex,
                        tagName: 'P',
                        isParagraph: true,
                        html: el.innerHTML,
                        text: text,
                    });
                } else if (el.innerHTML.trim() || el.tagName.toUpperCase() === 'FIGURE') {
                    parsed.push({
                        id: idx + 1000,
                        tagName: el.tagName.toUpperCase(),
                        isParagraph: false,
                        html: el.outerHTML,
                        text: text,
                    });
                }
            }
        });

        if (parsed.length === 0 && displayItem.description) {
            parsed.push({
                id: 1,
                tagName: 'P',
                isParagraph: true,
                html: displayItem.description,
                text: displayItem.description,
            });
        }

        return parsed;
    }, [displayItem]);

    // Handle toggle translate single paragraph
    const handleToggleTranslateParagraph = useCallback(
        async (pId: number, text: string) => {
            if (openedParagraphs[pId]) {
                setOpenedParagraphs((prev) => ({ ...prev, [pId]: false }));
                return;
            }

            if (translatedParagraphs[pId]) {
                setOpenedParagraphs((prev) => ({ ...prev, [pId]: true }));
                return;
            }

            setTranslatingParagraphs((prev) => ({ ...prev, [pId]: true }));
            try {
                const rawResult = await translateParagraph(text, displayItem?.id, pId);
                const cleanResult = (rawResult || '')
                    .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
                    .replace(/<think>[\s\S]*?<\/think>/gi, '')
                    .trim();
                setTranslatedParagraphs((prev) => ({ ...prev, [pId]: cleanResult }));
                setOpenedParagraphs((prev) => ({ ...prev, [pId]: true }));
            } catch {
                message.error('Không thể dịch đoạn văn này. Vui lòng thử lại.');
            } finally {
                setTranslatingParagraphs((prev) => ({ ...prev, [pId]: false }));
            }
        },
        [displayItem?.id, openedParagraphs, translatedParagraphs]
    );

    const handleCopySummary = useCallback(() => {
        if (!displayItem) return;
        const text = `${displayItem.title}\n\n${displayItem.description}\n\nNguồn: The Guardian (${displayItem.link})`;
        navigator.clipboard.writeText(text);
        message.success('Đã sao chép nội dung bài viết!');
    }, [displayItem]);

    const handleOpenFlashcardFromLookup = useCallback(
        (word: string, context: string) => {
            closeWordLookup();
            handleOpenFlashcardModal(word, context);
        },
        [closeWordLookup, handleOpenFlashcardModal]
    );

    if (!item) return null;

    const fontSizeStyles = {
        normal: { fontSize: '16px', lineHeight: 1.8 },
        large: { fontSize: '18px', lineHeight: 1.85 },
        xlarge: { fontSize: '20px', lineHeight: 1.9 },
    }[fontSizeLevel];

    return (
        <>
            <Modal
                open={open}
                onCancel={onClose}
                footer={null}
                width={880}
                centered
                bodyStyle={{ padding: '28px 32px', maxHeight: '88vh', overflowY: 'auto' }}
                style={{ borderRadius: '20px' }}
            >
                {/* Header tags and Font size controls */}
                <NewsDetailHeader
                    categoryMeta={categoryMeta}
                    pubDate={displayItem?.pubDate}
                    readingTime={displayItem?.readingTime}
                    fontSizeLevel={fontSizeLevel}
                    onFontSizeChange={setFontSizeLevel}
                />

                {/* Headline */}
                <h1
                    style={{
                        fontSize: '26px',
                        fontWeight: 800,
                        lineHeight: 1.35,
                        color: '#0f172a',
                        marginBottom: '12px',
                        letterSpacing: '-0.02em',
                    }}
                >
                    {displayItem?.title}
                </h1>

                {/* Standfirst / Summary */}
                {displayItem?.description && (
                    <div
                        style={{
                            fontSize: '16px',
                            lineHeight: 1.6,
                            color: '#475569',
                            fontWeight: 500,
                            marginBottom: '20px',
                            paddingLeft: '14px',
                            borderLeft: '3px solid #0284c7',
                        }}
                    >
                        {displayItem.description}
                    </div>
                )}

                {/* Author Byline */}
                {displayItem?.author && (
                    <div style={{ fontSize: '13px', color: '#64748b', fontStyle: 'italic', marginBottom: '18px' }}>
                        Tác giả: <strong style={{ color: '#1e293b' }}>{displayItem.author}</strong> • Xuất bản bởi <strong>The Guardian</strong>
                    </div>
                )}

                {/* British Voice Audio Player Bar */}
                <NewsSpeechControlBar
                    isSpeaking={isSpeaking}
                    isPaused={isPaused}
                    speechRate={speechRate}
                    onSpeechRateChange={setSpeechRate}
                    onToggleSpeech={handleToggleSpeech}
                    onStopSpeech={handleStopSpeech}
                />

                {/* Main Featured Photo */}
                {displayItem?.thumbnail && (
                    <div style={{ borderRadius: '14px', overflow: 'hidden', marginBottom: '24px', background: '#f8fafc' }}>
                        <img
                            alt={displayItem.title}
                            src={displayItem.mainImageUrl || displayItem.thumbnail}
                            style={{ width: '100%', maxHeight: '420px', objectFit: 'cover', display: 'block' }}
                        />
                        {displayItem.mainImageCaption && (
                            <div style={{ padding: '8px 14px', background: '#f1f5f9', fontSize: '12px', color: '#64748b', fontStyle: 'italic' }}>
                                {displayItem.mainImageCaption}
                            </div>
                        )}
                    </div>
                )}

                {/* Article Content with Interactive Paragraphs */}
                {isLoadingFull ? (
                    <div style={{ padding: '40px 0', textAlign: 'center' }}>
                        <Spin size="large" />
                        <div style={{ marginTop: '12px', color: '#64748b', fontSize: '14px' }}>
                            Đang tải đầy đủ nội dung bài báo & toàn bộ hình ảnh minh họa từ The Guardian...
                        </div>
                    </div>
                ) : (
                    <div
                        className="guardian-full-article"
                        style={{
                            ...fontSizeStyles,
                            color: '#334155',
                        }}
                    >
                        {articleBlocks.map((block) => {
                            if (block.isParagraph) {
                                return (
                                    <NewsParagraphItem
                                        key={block.id}
                                        blockId={block.id}
                                        text={block.text}
                                        html={block.html}
                                        isOpen={Boolean(openedParagraphs[block.id])}
                                        isTranslating={Boolean(translatingParagraphs[block.id])}
                                        translatedText={translatedParagraphs[block.id]}
                                        onToggleTranslate={handleToggleTranslateParagraph}
                                        onParagraphClick={handleParagraphClick}
                                    />
                                );
                            }

                            // Render non-paragraph block (figure, heading, blockquote)
                            return (
                                <div
                                    key={block.id}
                                    dangerouslySetInnerHTML={{ __html: block.html }}
                                    style={{ marginBottom: '18px' }}
                                />
                            );
                        })}
                    </div>
                )}

                {/* Custom Embedded CSS for The Guardian Article Layout */}
                <NewsModalStyles />

                {/* Footer Actions & Learning Tips Callout */}
                <NewsDetailFooter
                    sourceLink={displayItem?.link}
                    onClose={onClose}
                    onCopySummary={handleCopySummary}
                />
            </Modal>

            {/* Quick Word Lookup Popover Card (Academic Dictionary) */}
            {activeWordLookup && (
                <NewsWordLookupPopover
                    lookup={activeWordLookup}
                    popoverRef={lookupPopoverRef}
                    onClose={closeWordLookup}
                    onPlayAudio={playSpeech}
                    onOpenFlashcard={handleOpenFlashcardFromLookup}
                />
            )}

            {/* Flashcard Quick Add Modal */}
            <FlashcardQuickAddModal
                open={flashcardModalOpen}
                activeWord={fcWord}
                activeContext={fcContext}
                selectedDeckId={fcSelectedDeckId}
                decks={decks}
                isLoadingDecks={isLoadingDecks}
                deckOptions={deckOptions}
                newDeckTitle={fcNewDeckTitle}
                isCreatingDeck={fcIsCreatingDeck}
                isAiLoading={fcAiLoading}
                enrichedResult={fcEnrichedResult}
                currentImageIndex={fcCurrentImageIndex}
                isChangingImage={fcIsChangingImage}
                isSaving={fcIsSaving}
                onClose={handleCloseFlashcardModal}
                onChangeWord={(val) => setFcWord(val)}
                onAiAnalyze={(w, ctx) => handleAiAnalyze(w, ctx)}
                onChangeSelectedDeck={(val) => setFcSelectedDeckId(val)}
                onChangeNewDeckTitle={(val) => setFcNewDeckTitle(val)}
                onQuickCreateDeck={handleQuickCreateDeck}
                onCycleNextImage={handleCycleNextImage}
                onUpdateMeaningVi={(val) => {
                    if (fcEnrichedResult) {
                        setFcEnrichedResult({ ...fcEnrichedResult, meaningVi: val });
                    }
                }}
                onPlayAudio={(w, url) => {
                    if (url) {
                        new Audio(url).play().catch(() => playSpeech(w));
                    } else {
                        playSpeech(w);
                    }
                }}
                onSaveCard={handleSaveCard}
            />
        </>
    );
};
