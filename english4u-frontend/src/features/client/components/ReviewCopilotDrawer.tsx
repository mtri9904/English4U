import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Alert, Button, Empty, Input, Space, Tag, Typography } from 'antd';
import {
    BulbOutlined,
    CloseOutlined,
    PlayCircleOutlined,
    PushpinOutlined,
    ScissorOutlined,
    SendOutlined,
    StopOutlined,
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import type { CopilotChatMessage, CopilotFocusPayload, CopilotReplayAction, ReviewCopilotContext } from '../types/copilot.types';

const { Text, Title } = Typography;

const COPILOT_PANEL_MIN_WIDTH = 420;
const COPILOT_PANEL_MOBILE_MIN_WIDTH = 320;
const COPILOT_PANEL_MAX_WIDTH = 960;
const COPILOT_PANEL_DEFAULT_WIDTH = 560;
const COPILOT_PANEL_STORAGE_KEY = 'review-copilot-panel-width';
const COPILOT_PANEL_FIXED_TOP = 64;

const markdownComponents = {
    p: ({ children }: any) => <p style={{ margin: '0 0 10px', lineHeight: 1.7 }}>{children}</p>,
    strong: ({ children }: any) => (
        <strong
            style={{
                color: '#0f172a',
                fontWeight: 800,
                background: 'linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(191,219,254,0.7) 100%)',
                padding: '0 2px',
                borderRadius: 4,
            }}
        >
            {children}
        </strong>
    ),
    ul: ({ children }: any) => <ul style={{ margin: '0 0 12px', paddingLeft: 20, lineHeight: 1.7 }}>{children}</ul>,
    ol: ({ children }: any) => <ol style={{ margin: '0 0 12px', paddingLeft: 20, lineHeight: 1.7 }}>{children}</ol>,
    li: ({ children }: any) => <li style={{ marginBottom: 4 }}>{children}</li>,
    code: ({ children }: any) => (
        <code
            style={{
                background: '#e0f2fe',
                color: '#0f172a',
                borderRadius: 8,
                padding: '1px 6px',
                fontSize: '0.82rem',
            }}
        >
            {children}
        </code>
    ),
};

const thinkingPlaceholderText = 'Đang suy nghĩ';

const stripCodeFenceWrapper = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed.startsWith('```')) {
        return trimmed;
    }

    const firstLineEnd = trimmed.indexOf('\n');
    if (firstLineEnd === -1) {
        return trimmed;
    }

    const lastFenceIndex = trimmed.lastIndexOf('```');
    if (lastFenceIndex <= firstLineEnd) {
        return trimmed.slice(firstLineEnd + 1).trim();
    }

    return trimmed.slice(firstLineEnd + 1, lastFenceIndex).trim();
};

const hasVietnameseCharacters = (value: string) => /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(value);

const copilotReasoningMarkers = [
    "user's current focus",
    "user's question",
    'context:',
    'current_location_text',
    'current_focus_text',
    'review_document',
    'transcript provided',
    'transcript window provided',
    'the content of the transcript window',
    'scanning the transcript window',
    'scanning the transcript',
    'the provided text',
    'state that',
    'does not contain the answer',
    'question 11/12',
    'question 11',
    'question 12',
    'correct answers:',
    'evidence for',
    'drafting the response',
    'refining the vietnamese',
    'final polish',
    'self-correction',
    'the previous response was cut off',
    'continue from:',
    'completion:',
    'voice:',
    'language:',
    'structure:',
    'constraint:',
    'start from',
    'highlight the part',
    'final check',
    'observation:',
    'action:',
    'analysis:',
    'reasoning:',
    'constraint check',
    'problem:',
    'rule:',
    'inform the user',
    'image provided:',
    'quote:',
    'explanation:',
    'tutor voice',
    'no outside knowledge',
    'no internal thoughts',
    'formatting:',
    'timestamps:',
    'explain in vietnamese',
    'use quote english evidence first',
    "student's status",
    "the student didn't answer",
    'correct answer:',
    'student answer:',
    'there is no transcript window',
    'the review_document',
    'wait,',
    "let's",
    'okay, the logic holds',
    'the provided transcript window',
    'step 1',
    'step 2',
    'step 3',
    'step 4',
];

const looksLikeReasoningParagraph = (value: string) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
        return false;
    }

    return copilotReasoningMarkers.some((marker) => normalized.includes(marker));
};

const looksLikeStandaloneEnglishParagraph = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || hasVietnameseCharacters(trimmed)) {
        return false;
    }

    if (!/[a-z]/i.test(trimmed)) {
        return false;
    }

    if (/^(?:[-*]\s+|>\s*)/.test(trimmed)) {
        return false;
    }

    return trimmed.length >= 28;
};

const canonicalizeParagraph = (value: string) => (
    value
        .toLowerCase()
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/[`"'“”‘’]/g, '')
        .replace(/\s+/g, ' ')
        .replace(/[^a-z0-9à-ỹ ]/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
);

const likelyVietnameseAnswerLinePattern = /^(để|bạn|cụ thể|tóm lại|mình|ở đây|trong đoạn|đáp án|bằng chứng|giải thích|vì|do đó|vậy|nghe|hãy nghe|với câu|ở câu)/i;

const trimToUserFacingVietnameseStart = (value: string) => {
    const lines = value
        .split('\n')
        .map((line) => line.trimRight());

    const firstMeaningfulVietnameseLineIndex = lines.findIndex((line) => {
        const trimmed = line.trim();
        if (!trimmed) {
            return false;
        }

        if (looksLikeReasoningParagraph(trimmed)) {
            return false;
        }

        return hasVietnameseCharacters(trimmed) || likelyVietnameseAnswerLinePattern.test(trimmed);
    });

    if (firstMeaningfulVietnameseLineIndex <= 0) {
        return value;
    }

    return lines
        .slice(firstMeaningfulVietnameseLineIndex)
        .join('\n')
        .trim();
};

const cleanCopilotDisplayText = (value?: string | null) => {
    const normalized = trimToUserFacingVietnameseStart(
        stripCodeFenceWrapper(
        (value ?? '')
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .replace(/\$\\rightarrow\$/g, '->')
            .replace(/\$\\Rightarrow\$/g, '=>')
            .replace(/\$\\leftarrow\$/g, '<-')
            .replace(/\$\\Leftarrow\$/g, '<=')
            .replace(/\$\\leftrightarrow\$/g, '<->')
            .replace(/\$\\Leftrightarrow\$/g, '<=>')
            .replace(/\\rightarrow/g, '->')
            .replace(/\\Rightarrow/g, '=>')
            .replace(/\\leftarrow/g, '<-')
            .replace(/\\Leftarrow/g, '<=')
            .replace(/\\leftrightarrow/g, '<->')
            .replace(/\\Leftrightarrow/g, '<=>')
            .replace(/\$([^$\n]{1,80})\$/g, '$1')
            .trim(),
        ),
    );

    if (!normalized) {
        return '';
    }

    const paragraphs = normalized
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);

    const filteredParagraphs = paragraphs.filter((paragraph) => {
        if (looksLikeReasoningParagraph(paragraph)) {
            return false;
        }

        if (looksLikeStandaloneEnglishParagraph(paragraph)) {
            return false;
        }

        if (/^['"`]\w+/i.test(paragraph)) {
            return false;
        }

        return true;
    });

    const dedupedParagraphs: string[] = [];
    const seenParagraphs = new Set<string>();

    for (const paragraph of filteredParagraphs) {
        const canonical = canonicalizeParagraph(paragraph);
        if (!canonical) {
            continue;
        }

        if (seenParagraphs.has(canonical)) {
            continue;
        }

        const isContainedByPrevious = dedupedParagraphs.some((existingParagraph) => {
            const existingCanonical = canonicalizeParagraph(existingParagraph);
            return existingCanonical.includes(canonical) || canonical.includes(existingCanonical);
        });

        if (isContainedByPrevious) {
            continue;
        }

        seenParagraphs.add(canonical);
        dedupedParagraphs.push(paragraph);
    }

    if (dedupedParagraphs.length === 0) {
        return normalized;
    }

    const preferredStartIndex = dedupedParagraphs.findIndex((paragraph) => (
        /^(để|bạn|cụ thể|tóm lại|mình|ở đây|trong đoạn|đáp án)/i.test(paragraph.trim())
        || hasVietnameseCharacters(paragraph)
    ));

    const finalParagraphs = preferredStartIndex > 0
        ? dedupedParagraphs.slice(preferredStartIndex)
        : dedupedParagraphs;

    return finalParagraphs.join('\n\n').trim();
};

const formatCopilotMarkdown = (value?: string | null) => {
    const boldTokens: string[] = [];

    const withProtectedBold = cleanCopilotDisplayText(value)
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\*\*([^*\n][^*\n]{0,160}?)\*\*/g, (_, content: string) => {
            const token = `@@COPILOT_BOLD_${boldTokens.length}@@`;
            boldTokens.push(content.trim());
            return token;
        });

    const normalized = withProtectedBold
        .replace(/(^|\n)\s*\*\s+(?=\S)/g, '$1- ')
        .replace(/([:.;!?])\*(\S)/g, '$1\n\n- $2')
        .replace(/\*\s+\*/g, ' ')
        .replace(/\*/g, '')
        .replace(/([.!?…:;])(?=[^\s\n>"')\]}])/g, '$1 ')
        .replace(/([.!?…:;])\s{2,}/g, '$1 ')
        .replace(/([A-Za-zÀ-ỹ])(\d)/g, '$1 $2')
        .replace(/(\d)([A-Za-zÀ-ỹ])/g, '$1 $2')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/([.!?])\s+(?=-\s+)/g, '$1\n\n')
        .replace(/([.!?])\s+(?=\d+\.\s+)/g, '$1\n\n')
        .replace(/:\s+(?=-\s+)/g, ':\n\n')
        .replace(/:\s+(?=\d+\.\s+)/g, ':\n\n')
        .replace(/([.!?])\s+(?=@@COPILOT_BOLD_\d+@@)/g, '$1\n\n')
        .replace(/(^|\n)(@@COPILOT_BOLD_\d+@@:?)\s*/g, '$1$2\n\n')
        .replace(/(^|\n)(-\s+[^\n]+)(?=\n(?!-|\d+\.))/g, '$1$2\n')
        .replace(/(^|\n)(\d+\.\s+[^\n]+)(?=\n(?!-|\d+\.))/g, '$1$2\n')
        .replace(/^(Chào bạn[^.!?\n]*[.!?])\s+/i, '$1\n\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    return boldTokens.reduce(
        (current, content, index) => current.replace(`@@COPILOT_BOLD_${index}@@`, `**${content}**`),
        normalized,
    );
};

const getWidthBounds = (viewportWidth: number) => {
    const maxWidth = Math.max(
        COPILOT_PANEL_MOBILE_MIN_WIDTH,
        Math.min(COPILOT_PANEL_MAX_WIDTH, viewportWidth - 12),
    );
    const minWidth = Math.min(
        viewportWidth - 12,
        viewportWidth < 960 ? COPILOT_PANEL_MOBILE_MIN_WIDTH : COPILOT_PANEL_MIN_WIDTH,
    );

    return {
        min: Math.max(COPILOT_PANEL_MOBILE_MIN_WIDTH, minWidth),
        max: Math.max(COPILOT_PANEL_MOBILE_MIN_WIDTH, maxWidth),
    };
};

const clampPanelWidth = (width: number, viewportWidth: number) => {
    const bounds = getWidthBounds(viewportWidth);
    return Math.min(bounds.max, Math.max(bounds.min, Math.round(width)));
};

const getInitialPanelWidth = () => {
    if (typeof window === 'undefined') {
        return COPILOT_PANEL_DEFAULT_WIDTH;
    }

    const storedValue = Number(window.localStorage.getItem(COPILOT_PANEL_STORAGE_KEY));
    if (!Number.isFinite(storedValue)) {
        return clampPanelWidth(COPILOT_PANEL_DEFAULT_WIDTH, window.innerWidth);
    }

    return clampPanelWidth(storedValue, window.innerWidth);
};

export const ReviewCopilotDrawer = ({
    open,
    loadingContext,
    context,
    messages,
    draftMessage,
    isStreaming,
    errorMessage,
    focusComposerSignal,
    focusChips,
    onClose,
    onDraftChange,
    onSendMessage,
    onStopStreaming,
    onClearFocus,
    onRemoveFocus,
    onClearSelection,
    selectionChipLabel,
    onReservedWidthChange,
    onPlayReplayAction,
}: {
    open: boolean;
    loadingContext: boolean;
    context: ReviewCopilotContext | null;
    messages: CopilotChatMessage[];
    draftMessage: string;
    isStreaming: boolean;
    errorMessage?: string | null;
    focusComposerSignal: number;
    focusChips: CopilotFocusPayload[];
    onClose: () => void;
    onDraftChange: (nextValue: string) => void;
    onSendMessage: (message: string) => void;
    onStopStreaming: () => void;
    onClearFocus: () => void;
    onRemoveFocus: (focus: CopilotFocusPayload) => void;
    onClearSelection: () => void;
    selectionChipLabel?: string;
    onReservedWidthChange?: (nextWidth: number) => void;
    onPlayReplayAction?: (action: CopilotReplayAction) => void;
}) => {
    const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
    const composerRef = useRef<any>(null);
    const resizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
    const [viewportWidth, setViewportWidth] = useState(() => (
        typeof window === 'undefined' ? 1440 : window.innerWidth
    ));
    const [panelWidth, setPanelWidth] = useState(getInitialPanelWidth);

    const canSend = draftMessage.trim().length > 0 && !loadingContext && !isStreaming && !!context;
    const hasSelection = !!context?.selectedText?.trim();
    const hasFocus = focusChips.length > 0;
    const hasContextCards = hasSelection || hasFocus;
    const actualPanelWidth = clampPanelWidth(panelWidth, viewportWidth);
    const canResize = viewportWidth > 980 && actualPanelWidth < viewportWidth - 18;
    const occupiedWidth = actualPanelWidth;

    useEffect(() => {
        const handleResize = () => setViewportWidth(window.innerWidth);

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        setPanelWidth((current) => clampPanelWidth(current, viewportWidth));
    }, [viewportWidth]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        window.localStorage.setItem(COPILOT_PANEL_STORAGE_KEY, String(actualPanelWidth));
    }, [actualPanelWidth]);

    useEffect(() => {
        const handlePointerMove = (event: PointerEvent) => {
            const resizeState = resizeStateRef.current;
            if (!resizeState || !canResize) {
                return;
            }

            const delta = resizeState.startX - event.clientX;
            setPanelWidth(clampPanelWidth(resizeState.startWidth + delta, window.innerWidth));
        };

        const stopResize = () => {
            if (!resizeStateRef.current) {
                return;
            }

            resizeStateRef.current = null;
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', stopResize);
        window.addEventListener('pointercancel', stopResize);

        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', stopResize);
            window.removeEventListener('pointercancel', stopResize);
            stopResize();
        };
    }, [canResize]);

    useEffect(() => {
        scrollAnchorRef.current?.scrollIntoView({
            behavior: messages.length > 0 ? 'smooth' : 'auto',
            block: 'end',
        });
    }, [messages, isStreaming, loadingContext]);

    useEffect(() => {
        if (!open) {
            return;
        }

        const timer = window.setTimeout(() => {
            composerRef.current?.resizableTextArea?.textArea?.focus();
        }, 30);

        return () => window.clearTimeout(timer);
    }, [open, focusComposerSignal]);

    useEffect(() => {
        onReservedWidthChange?.(open ? occupiedWidth : 0);

        return () => {
            onReservedWidthChange?.(0);
        };
    }, [occupiedWidth, onReservedWidthChange, open]);

    const panelTitle = useMemo(() => 'AI gia sư', []);
    const promptSuggestions = useMemo(() => {
        const skillType = context?.skillType?.trim().toUpperCase();

        if (skillType === 'WRITING') {
            return [
                'Giải thích toàn bộ lỗi sai nổi bật trong bài này.',
                'Chỉ ra các điểm mình cần cải thiện nhất để tăng band Writing.',
                'Đánh giá bố cục, từ vựng và ngữ pháp của 2 part của bài viết.',
            ];
        }

        if (skillType === 'READING') {
            return [
                'Giải thích toàn bộ lỗi sai nổi bật trong bài này.',
                'Tóm tắt các dạng câu mình làm chưa tốt trong bài Reading này.',
                'Chỉ cách tìm đáp án nhanh hơn cho các câu mình đã làm sai.',
            ];
        }

        if (skillType === 'LISTENING') {
            return [
                'Giải thích toàn bộ lỗi sai nổi bật trong bài này.',
                'Tóm tắt các phần nghe mình làm chưa tốt trong bài này.',
                'Chỉ cách nghe keyword và loại đáp án nhiễu hiệu quả hơn.',
            ];
        }

        return [
            'Giải thích toàn bộ lỗi sai nổi bật trong bài này.',
            'Tóm tắt những phần mình làm chưa tốt trong bài này.',
            'Chỉ ra các điểm quan trọng mình nên cải thiện trong bài này.',
        ];
    }, [context?.skillType]);

    const handleSubmit = () => {
        const trimmed = draftMessage.trim();
        if (!trimmed || !canSend) {
            return;
        }

        onSendMessage(trimmed);
    };

    const handleResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!canResize) {
            return;
        }

        event.preventDefault();
        resizeStateRef.current = {
            startX: event.clientX,
            startWidth: actualPanelWidth,
        };
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';
    };

    if (!open || typeof document === 'undefined') {
        return null;
    }

    const panelNode = (
        <div
            style={{
                position: 'fixed',
                top: COPILOT_PANEL_FIXED_TOP,
                right: 0,
                bottom: 0,
                zIndex: 1200,
                display: 'flex',
                alignItems: 'stretch',
                gap: 16,
                pointerEvents: 'auto',
            }}
        >
            <style>{`
                @keyframes copilot-thinking-shimmer {
                    0% {
                        background-position: 220% 50%;
                    }
                    100% {
                        background-position: -40% 50%;
                    }
                }
            `}</style>
            <section
                data-copilot-drawer-root="true"
                aria-label="AI Copilot"
                style={{
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    width: actualPanelWidth,
                    minWidth: actualPanelWidth,
                    maxWidth: actualPanelWidth,
                    height: `calc(100vh - ${COPILOT_PANEL_FIXED_TOP}px)`,
                    borderLeft: '1px solid #dbeafe',
                    borderTop: '1px solid #dbeafe',
                    borderRadius: '24px 0 0 0',
                    overflow: 'hidden',
                    overflowX: 'hidden',
                    background: 'linear-gradient(180deg, #f8fbff 0%, #ffffff 55%)',
                    boxShadow: '0 18px 42px rgba(15, 23, 42, 0.16)',
                    pointerEvents: 'auto',
                }}
            >
                {canResize ? (
                    <div
                        role="separator"
                        aria-orientation="vertical"
                        onPointerDown={handleResizeStart}
                        style={{
                            position: 'absolute',
                            top: 0,
                            bottom: 0,
                            left: -10,
                            width: 18,
                            cursor: 'col-resize',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 2,
                        }}
                    >
                        <div
                            style={{
                                width: 4,
                                height: 72,
                                borderRadius: 999,
                                background: '#93c5fd',
                                boxShadow: '0 0 0 7px rgba(219, 234, 254, 0.8)',
                            }}
                        />
                    </div>
                ) : null}

                <div
                    style={{
                        borderBottom: '1px solid #e2e8f0',
                        padding: '14px 18px 12px',
                        background: 'rgba(255,255,255,0.95)',
                        backdropFilter: 'blur(12px)',
                    }}
                >
                    <Space direction="vertical" size={10} style={{ width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                            <div style={{ minWidth: 0 }}>
                                <Title level={5} style={{ margin: 0 }}>{panelTitle}</Title>
                            </div>
                            <Button type="text" icon={<CloseOutlined />} onClick={onClose} aria-label="Đóng AI Copilot" />
                        </div>
                    </Space>
                </div>

                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: 18 }}>
                    {loadingContext ? (
                        <div
                            style={{
                                minHeight: '100%',
                                display: 'grid',
                                placeItems: 'center',
                                padding: '32px 0',
                            }}
                        >
                            <Space direction="vertical" size={12} align="center">
                                <Title level={5} style={{ margin: 0 }}>Đang tải tài liệu...</Title>
                                <Text type="secondary">Hệ thống đang chuẩn bị toàn bộ bài review cho Copilot.</Text>
                            </Space>
                        </div>
                    ) : messages.length === 0 ? (
                        <div
                            style={{
                                minHeight: '100%',
                                display: 'grid',
                                placeItems: 'center',
                            }}
                        >
                            <div
                                style={{
                                    width: '100%',
                                    maxWidth: 420,
                                    textAlign: 'center',
                                }}
                            >
                                <Empty
                                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                                    description="Copilot có thể trả lời xuyên suốt về toàn bộ bài đã làm."
                                />
                                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                                    {promptSuggestions.map((suggestion) => (
                                        <Button
                                            key={suggestion}
                                            icon={<BulbOutlined />}
                                            onClick={() => onSendMessage(suggestion)}
                                            block
                                            style={{
                                                height: 'auto',
                                                whiteSpace: 'normal',
                                                lineHeight: 1.5,
                                                paddingBlock: 10,
                                            }}
                                        >
                                            {suggestion}
                                        </Button>
                                    ))}
                                </Space>
                            </div>
                        </div>
                    ) : (
                        <Space direction="vertical" size={14} style={{ width: '100%' }}>
                            {messages.map((message) => {
                                const isUser = message.role === 'user';
                                const isStreamingMessage = message.status === 'streaming';
                                const isThinkingPlaceholder = isStreamingMessage && !message.content.trim();
                                const bubbleBackground = isUser
                                    ? 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)'
                                    : '#ffffff';
                                const bubbleColor = isUser ? '#ffffff' : '#334155';
                                const replayAction = !isUser ? message.replayAction ?? null : null;

                                return (
                                    <div
                                        key={message.id}
                                        style={{
                                            display: 'flex',
                                            justifyContent: isUser ? 'flex-end' : 'flex-start',
                                        }}
                                    >
                                        <div
                                            style={{
                                                maxWidth: '92%',
                                                borderRadius: 18,
                                                padding: '12px 14px',
                                                background: bubbleBackground,
                                                color: bubbleColor,
                                                border: isUser ? 'none' : '1px solid #dbeafe',
                                                boxShadow: isUser
                                                    ? '0 10px 24px rgba(37, 99, 235, 0.22)'
                                                    : '0 8px 24px rgba(15, 23, 42, 0.06)',
                                                overflowWrap: 'anywhere',
                                                wordBreak: 'break-word',
                                            }}
                                        >
                                            {isUser ? (
                                                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.65 }}>{message.content}</div>
                                            ) : isThinkingPlaceholder ? (
                                                <div
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        minHeight: 34,
                                                        fontSize: 16,
                                                        fontWeight: 700,
                                                        lineHeight: 1.6,
                                                        color: 'transparent',
                                                        backgroundImage: 'linear-gradient(110deg, #94a3b8 0%, #0f172a 22%, #60a5fa 50%, #0f172a 78%, #94a3b8 100%)',
                                                        backgroundSize: '220% 100%',
                                                        backgroundClip: 'text',
                                                        WebkitBackgroundClip: 'text',
                                                        animation: 'copilot-thinking-shimmer 1.9s linear infinite',
                                                    }}
                                                >
                                                    {thinkingPlaceholderText}
                                                </div>
                                            ) : (
                                                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                                                    <ReactMarkdown components={markdownComponents}>
                                                        {isStreamingMessage
                                                            ? `${formatCopilotMarkdown(message.content)}▍`
                                                            : formatCopilotMarkdown(message.content)}
                                                    </ReactMarkdown>
                                                    {replayAction ? (
                                                        <div
                                                            style={{
                                                                borderRadius: 14,
                                                                border: '1px solid #bfdbfe',
                                                                background: '#eff6ff',
                                                                padding: 12,
                                                            }}
                                                        >
                                                            <Space direction="vertical" size={8} style={{ width: '100%' }}>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                                                                    <div>
                                                                        <div style={{ fontSize: 12, fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                                                                            Replay audio
                                                                        </div>
                                                                        <div style={{ fontWeight: 700, color: '#0f172a' }}>
                                                                            {replayAction.questionNumber != null
                                                                                ? `Câu ${replayAction.questionNumber} • ${replayAction.answerTimestampLabel ?? replayAction.timestampLabel}`
                                                                                : replayAction.answerTimestampLabel ?? replayAction.timestampLabel}
                                                                        </div>
                                                                        {replayAction.answerTimestampLabel ? (
                                                                            <div style={{ marginTop: 2, fontSize: 12, color: '#475569' }}>
                                                                                Phát lại với ngữ cảnh: {replayAction.timestampLabel}
                                                                            </div>
                                                                        ) : null}
                                                                    </div>
                                                                    <Button
                                                                        type="primary"
                                                                        icon={<PlayCircleOutlined />}
                                                                        onClick={() => onPlayReplayAction?.(replayAction)}
                                                                    >
                                                                        Nghe lại đoạn này
                                                                    </Button>
                                                                </div>
                                                                {replayAction.transcriptSnippet ? (
                                                                    <div
                                                                        style={{
                                                                            whiteSpace: 'pre-wrap',
                                                                            lineHeight: 1.7,
                                                                            color: '#334155',
                                                                            borderLeft: '3px solid #93c5fd',
                                                                            paddingLeft: 10,
                                                                        }}
                                                                    >
                                                                        <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>
                                                                            Tapescript đoạn này
                                                                        </div>
                                                                        {replayAction.transcriptSnippet}
                                                                    </div>
                                                                ) : null}
                                                            </Space>
                                                        </div>
                                                    ) : null}
                                                </Space>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </Space>
                    )}

                    {errorMessage ? (
                        <Alert
                            style={{ marginTop: 16 }}
                            type="error"
                            showIcon
                            message={errorMessage}
                        />
                    ) : null}

                    <div ref={scrollAnchorRef} />
                </div>

                <div
                    style={{
                        padding: 16,
                        borderTop: '1px solid #e2e8f0',
                        background: '#ffffff',
                        position: 'relative',
                        zIndex: 1,
                        flexShrink: 0,
                        pointerEvents: 'auto',
                    }}
                >
                    <Space direction="vertical" size={10} style={{ width: '100%' }}>
                        {hasContextCards ? (
                            <div
                                style={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: 8,
                                    padding: 10,
                                    border: '1px solid #dbeafe',
                                    borderRadius: 16,
                                    background: '#f8fbff',
                                }}
                            >
                                {focusChips.map((focus) => (
                                    <div
                                        key={focus.questionNumber != null ? `focus-${focus.questionNumber}` : focus.label}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            maxWidth: '100%',
                                            padding: '6px 10px',
                                            borderRadius: 999,
                                            border: '1px solid #fde68a',
                                            background: '#fffbeb',
                                            color: '#92400e',
                                        }}
                                    >
                                        <PushpinOutlined />
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {focus.label}
                                        </span>
                                        <Button
                                            size="small"
                                            type="text"
                                            icon={<CloseOutlined />}
                                            onClick={() => onRemoveFocus(focus)}
                                            style={{ color: '#92400e' }}
                                        />
                                    </div>
                                ))}

                                {hasSelection ? (
                                    <div
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            maxWidth: '100%',
                                            padding: '6px 10px',
                                            borderRadius: 999,
                                            border: '1px solid #bfdbfe',
                                            background: '#eff6ff',
                                            color: '#1d4ed8',
                                        }}
                                    >
                                        <ScissorOutlined />
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {selectionChipLabel || 'Từ khóa trích đoạn'}
                                        </span>
                                        <Button
                                            size="small"
                                            type="text"
                                            icon={<CloseOutlined />}
                                            onClick={onClearSelection}
                                            style={{ color: '#1d4ed8' }}
                                        />
                                    </div>
                                ) : null}
                            </div>
                        ) : null}

                        <Input.TextArea
                            ref={composerRef}
                            value={draftMessage}
                            disabled={loadingContext || !context}
                            autoSize={{ minRows: 3, maxRows: 7 }}
                            placeholder="Hỏi bất kỳ điều gì trong bài review này, hoặc bôi đen một đoạn rồi nhấn Ctrl + L."
                            onChange={(event) => onDraftChange(event.target.value)}
                            onPressEnter={(event) => {
                                if (!event.shiftKey) {
                                    event.preventDefault();
                                    handleSubmit();
                                }
                            }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                            <Space wrap>
                                {hasFocus ? (
                                    <Button onClick={onClearFocus}>
                                        Bỏ tất cả focus
                                    </Button>
                                ) : null}
                                {hasSelection ? (
                                    <Button icon={<CloseOutlined />} onClick={onClearSelection}>
                                        Bỏ từ khóa
                                    </Button>
                                ) : null}
                                <Text type="secondary">
                                    {isStreaming ? 'Copilot đang trả lời...' : 'Ctrl + L để gắn đoạn bôi đen'}
                                </Text>
                            </Space>
                            <Space>
                                {isStreaming ? (
                                    <Button icon={<StopOutlined />} onClick={onStopStreaming}>
                                        Dừng
                                    </Button>
                                ) : null}
                                <Button
                                    type="primary"
                                    icon={<SendOutlined />}
                                    disabled={!canSend}
                                    htmlType="button"
                                    onClick={handleSubmit}
                                >
                                    Gửi
                                </Button>
                            </Space>
                        </div>
                    </Space>
                </div>
            </section>
        </div>
    );

    return createPortal(panelNode, document.body);
};
