import { useEffect, useRef, useState } from 'react';

export interface FloatingButtonState {
    visible: boolean;
    x: number;
    y: number;
    word: string;
    context: string;
}

interface UseTextSelectionFlashcardProps {
    modalOpen: boolean;
}

export const useTextSelectionFlashcard = ({ modalOpen }: UseTextSelectionFlashcardProps) => {
    const [floatingBtn, setFloatingBtn] = useState<FloatingButtonState>({
        visible: false,
        x: 0,
        y: 0,
        word: '',
        context: '',
    });

    const isSelectingRef = useRef(false);
    const modalOpenRef = useRef(false);

    useEffect(() => {
        modalOpenRef.current = modalOpen;
        if (modalOpen) {
            setFloatingBtn((prev) => (prev.visible ? { ...prev, visible: false } : prev));
        }
    }, [modalOpen]);

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
            const text = rawText.replace(/[ \t\r\n]+/g, ' ').trim();
            const cleanWord = text.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '').trim();

            if (cleanWord.length < 2 || cleanWord.length > 60) {
                return;
            }

            if (!/[a-zA-Z]/.test(cleanWord)) {
                return;
            }

            const anchor = selection.anchorNode;
            const anchorEl = anchor instanceof Element ? anchor : anchor?.parentElement;
            if (
                anchorEl?.closest(
                    'input, textarea, [contenteditable="true"], .ant-modal, .ant-drawer, [data-copilot-drawer-root="true"]',
                )
            ) {
                return;
            }

            try {
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                if (rect.width === 0 && rect.height === 0) {
                    return;
                }

                let context = '';
                const blockEl = anchorEl?.closest('p, div, li, span, td, h1, h2, h3, h4, h5, h6') || anchorEl;
                const parentText = blockEl?.textContent?.replace(/\s+/g, ' ').trim() || '';
                if (parentText) {
                    const sentences = parentText.split(/(?<=[.!?])\s+/);
                    const matched = sentences.find((s) => s.toLowerCase().includes(cleanWord.toLowerCase()));
                    context = (matched || parentText).slice(0, 300).trim();
                }

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

    const hideFloatingBtn = () => {
        setFloatingBtn((prev) => (prev.visible ? { ...prev, visible: false } : prev));
    };

    return {
        floatingBtn,
        setFloatingBtn,
        hideFloatingBtn,
    };
};

