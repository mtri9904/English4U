import { useState, useEffect, useRef, useCallback } from 'react';
import { lookupWordDictionary, translateParagraph, type NewsDictionaryResult } from '../services/news.service';

export interface ActiveWordLookup {
    word: string;
    context: string;
    x: number;
    y: number;
    phonetic?: string;
    partOfSpeech?: string;
    meaningVi?: string;
    definitionEn?: string;
    audioUrl?: string;
    isLoading?: boolean;
}

export function useNewsWordLookup(open: boolean) {
    const [activeWordLookup, setActiveWordLookup] = useState<ActiveWordLookup | null>(null);
    const lookupPopoverRef = useRef<HTMLDivElement>(null);

    // Dismiss active word popup when modal closes
    useEffect(() => {
        if (!open) {
            setActiveWordLookup(null);
        }
    }, [open]);

    // Dismiss active word popup on outside click
    useEffect(() => {
        const handleOutsideClick = (e: MouseEvent) => {
            if (
                lookupPopoverRef.current &&
                !lookupPopoverRef.current.contains(e.target as Node)
            ) {
                setActiveWordLookup(null);
            }
        };

        if (activeWordLookup) {
            document.addEventListener('mousedown', handleOutsideClick);
        }
        return () => {
            document.removeEventListener('mousedown', handleOutsideClick);
        };
    }, [activeWordLookup]);

    const handleParagraphClick = useCallback(
        (e: React.MouseEvent<HTMLParagraphElement>, paragraphText: string) => {
            const target = e.target as HTMLElement;
            if (target.tagName.toUpperCase() === 'A') {
                return;
            }

            const selection = window.getSelection();
            let word = '';

            if (selection && !selection.isCollapsed) {
                const selectedText = selection.toString().trim();
                if (selectedText.length >= 2 && selectedText.length <= 60 && /[a-zA-Z]/.test(selectedText)) {
                    word = selectedText.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');
                }
            }

            if (!word && (document as any).caretRangeFromPoint) {
                const range = (document as any).caretRangeFromPoint(e.clientX, e.clientY);
                if (range && range.startContainer && range.startContainer.nodeType === Node.TEXT_NODE) {
                    const text = range.startContainer.textContent || '';
                    const offset = range.startOffset;

                    let start = offset;
                    while (start > 0 && /[a-zA-Z0-9'-]/.test(text[start - 1])) {
                        start--;
                    }
                    let end = offset;
                    while (end < text.length && /[a-zA-Z0-9'-]/.test(text[end])) {
                        end++;
                    }

                    const raw = text.slice(start, end).trim();
                    if (raw.length >= 2 && /[a-zA-Z]/.test(raw)) {
                        word = raw.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');
                    }
                }
            }

            if (word) {
                const clickX = Math.min(Math.max(16, e.clientX - 160), window.innerWidth - 350);
                const clickY = Math.min(e.clientY + 12, window.innerHeight - 300);

                setActiveWordLookup({
                    word,
                    context: paragraphText,
                    x: clickX,
                    y: clickY,
                    isLoading: true,
                });

                // Call academic dictionary endpoint
                lookupWordDictionary(word)
                    .then((dictData: NewsDictionaryResult | null) => {
                        if (dictData) {
                            setActiveWordLookup((prev) =>
                                prev && prev.word.toLowerCase() === word.toLowerCase()
                                    ? {
                                          ...prev,
                                          phonetic: dictData.phonetic,
                                          partOfSpeech: dictData.partOfSpeech,
                                          meaningVi: dictData.meaningVi,
                                          definitionEn: dictData.definitionEn,
                                          audioUrl: dictData.audioUrl,
                                          isLoading: false,
                                      }
                                    : prev
                            );
                        } else {
                            // Quick fallback to simple translation
                            translateParagraph(word).then((meaning) => {
                                setActiveWordLookup((prev) =>
                                    prev && prev.word.toLowerCase() === word.toLowerCase()
                                        ? { ...prev, meaningVi: meaning, isLoading: false }
                                        : prev
                                );
                            });
                        }
                    })
                    .catch(() => {
                        setActiveWordLookup((prev) => (prev ? { ...prev, isLoading: false } : prev));
                    });
            }
        },
        []
    );

    const closeWordLookup = useCallback(() => {
        setActiveWordLookup(null);
    }, []);

    return {
        activeWordLookup,
        lookupPopoverRef,
        handleParagraphClick,
        closeWordLookup,
    };
}

