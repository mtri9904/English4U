import { useEffect, useMemo, useRef, useState } from 'react';
import type { PracticeSessionDto } from '../types/session.types';
import type { CopilotChatMessage, CopilotFocusPayload, ReviewCopilotContext } from '../types/copilot.types';
import {
    buildWritingReviewCopilotContext,
    buildWritingTaskFocusPayload,
} from '../utils/reviewCopilotContext.utils';
import {
    buildCopilotOutgoingMessage,
    createCopilotMessageId,
    dedupeCopilotFocuses,
    extractSelectionKeywords,
    mergeCopilotImages,
    readSelectedReviewText,
} from '../utils/reviewCopilot.utils';
import { streamCopilotChat } from '../services/copilot.service';
import { getWritingReviewAnswerMap, getWritingTasks } from '../utils/sessionReview.utils';

interface UseWritingReviewCopilotProps {
    session?: PracticeSessionDto | null;
    isWritingSession: boolean;
    canUseWritingCopilot: boolean;
}

export const useWritingReviewCopilot = ({
    session,
    isWritingSession,
    canUseWritingCopilot,
}: UseWritingReviewCopilotProps) => {
    const [writingCopilotOpen, setWritingCopilotOpen] = useState(false);
    const [writingCopilotPrepared, setWritingCopilotPrepared] = useState(false);
    const [writingCopilotLoadingContext, setWritingCopilotLoadingContext] = useState(false);
    const [writingCopilotErrorMessage, setWritingCopilotErrorMessage] = useState<string | null>(null);
    const [writingCopilotDraftMessage, setWritingCopilotDraftMessage] = useState('');
    const [writingCopilotMessages, setWritingCopilotMessages] = useState<CopilotChatMessage[]>([]);
    const [writingCopilotSelectedText, setWritingCopilotSelectedText] = useState('');
    const [writingCopilotFocuses, setWritingCopilotFocuses] = useState<CopilotFocusPayload[]>([]);
    const [writingCopilotComposerFocusSignal, setWritingCopilotComposerFocusSignal] = useState(0);
    const [writingCopilotStreamingMessageId, setWritingCopilotStreamingMessageId] = useState<string | null>(null);
    const [writingCopilotLayout, setWritingCopilotLayout] = useState({ open: false, reservedWidth: 0 });
    const writingCopilotAbortRef = useRef<AbortController | null>(null);
    const writingCopilotPreparationTimeoutRef = useRef<number | null>(null);

    const writingTasks = useMemo(() => getWritingTasks(session), [session]);
    const writingReviewAnswerMap = useMemo(() => getWritingReviewAnswerMap(session), [session]);

    const writingCopilotBaseContext = useMemo<ReviewCopilotContext | null>(
        () => (session && isWritingSession ? buildWritingReviewCopilotContext({ session }) : null),
        [session, isWritingSession],
    );

    const writingFocusSummaryLabel = useMemo(
        () => (writingCopilotFocuses.length > 0 ? writingCopilotFocuses.map((focus) => focus.label).join(', ') : null),
        [writingCopilotFocuses],
    );

    const writingFocusSummaryText = useMemo(
        () => (
            writingCopilotFocuses.length > 0
                ? writingCopilotFocuses.map((focus) => `=== ${focus.label} ===\n${focus.text}`).join('\n\n')
                : null
        ),
        [writingCopilotFocuses],
    );

    const writingCopilotContext = useMemo<ReviewCopilotContext | null>(
        () => (
            writingCopilotBaseContext
                ? {
                    ...writingCopilotBaseContext,
                    currentFocusLabel: writingFocusSummaryLabel,
                    currentFocusText: writingFocusSummaryText,
                    focusedQuestionNumber: null,
                    selectedText: writingCopilotSelectedText || null,
                    selectedTextLabel: writingCopilotSelectedText ? 'Từ khóa trích đoạn' : null,
                    contextImages: mergeCopilotImages(
                        writingCopilotBaseContext.contextImages,
                        ...writingCopilotFocuses.map((focus) => focus.images),
                    ),
                }
                : null
        ),
        [
            writingCopilotBaseContext,
            writingCopilotFocuses,
            writingCopilotSelectedText,
            writingFocusSummaryLabel,
            writingFocusSummaryText,
        ],
    );

    useEffect(() => {
        if (!isWritingSession) {
            setWritingCopilotLayout({ open: false, reservedWidth: 0 });
        }
    }, [isWritingSession, session?.sessionId]);

    useEffect(() => {
        setWritingCopilotOpen(false);
        setWritingCopilotPrepared(false);
        setWritingCopilotLoadingContext(false);
        setWritingCopilotErrorMessage(null);
        setWritingCopilotDraftMessage('');
        setWritingCopilotMessages([]);
        setWritingCopilotSelectedText('');
        setWritingCopilotFocuses([]);
        setWritingCopilotStreamingMessageId(null);
        setWritingCopilotLayout({ open: false, reservedWidth: 0 });
        writingCopilotAbortRef.current?.abort();
        if (writingCopilotPreparationTimeoutRef.current != null) {
            window.clearTimeout(writingCopilotPreparationTimeoutRef.current);
            writingCopilotPreparationTimeoutRef.current = null;
        }
    }, [session?.sessionId]);

    useEffect(() => () => {
        writingCopilotAbortRef.current?.abort();
        if (writingCopilotPreparationTimeoutRef.current != null) {
            window.clearTimeout(writingCopilotPreparationTimeoutRef.current);
        }
    }, []);

    useEffect(() => {
        if (!canUseWritingCopilot) {
            setWritingCopilotOpen(false);
        }
    }, [canUseWritingCopilot]);

    const stopWritingCopilotStream = () => {
        writingCopilotAbortRef.current?.abort();
        writingCopilotAbortRef.current = null;
        setWritingCopilotStreamingMessageId(null);
    };

    const prepareWritingCopilotIfNeeded = () => {
        if (writingCopilotPreparationTimeoutRef.current != null) {
            window.clearTimeout(writingCopilotPreparationTimeoutRef.current);
            writingCopilotPreparationTimeoutRef.current = null;
        }

        if (writingCopilotPrepared) {
            setWritingCopilotLoadingContext(false);
            return;
        }

        setWritingCopilotLoadingContext(true);
        writingCopilotPreparationTimeoutRef.current = window.setTimeout(() => {
            setWritingCopilotPrepared(true);
            setWritingCopilotLoadingContext(false);
            writingCopilotPreparationTimeoutRef.current = null;
        }, 520);
    };

    const openWritingCopilot = (focus?: CopilotFocusPayload | null) => {
        setWritingCopilotErrorMessage(null);
        setWritingCopilotOpen(true);
        if (focus) {
            setWritingCopilotFocuses((current) => dedupeCopilotFocuses([...current, focus]));
        }
        prepareWritingCopilotIfNeeded();
        setWritingCopilotComposerFocusSignal((current) => current + 1);
    };

    const handleCloseWritingCopilot = () => {
        stopWritingCopilotStream();
        if (writingCopilotPreparationTimeoutRef.current != null) {
            window.clearTimeout(writingCopilotPreparationTimeoutRef.current);
            writingCopilotPreparationTimeoutRef.current = null;
        }
        setWritingCopilotLoadingContext(false);
        setWritingCopilotErrorMessage(null);
        setWritingCopilotOpen(false);
    };

    const handleFocusWritingCopilotTask = (taskId: string) => {
        const task = writingTasks.find((item) => item.id === taskId);
        if (!task) {
            return;
        }

        openWritingCopilot(buildWritingTaskFocusPayload({
            task,
            answer: writingReviewAnswerMap[task.id],
        }));
    };

    const updateWritingCopilotMessages = (updater: (messages: CopilotChatMessage[]) => CopilotChatMessage[]) => {
        setWritingCopilotMessages((current) => updater(current));
    };

    const handleSendWritingCopilotMessage = async (userMessage: string) => {
        if (!writingCopilotContext || writingCopilotLoadingContext) {
            return;
        }

        const outgoingUserMessage = buildCopilotOutgoingMessage(userMessage, writingCopilotContext);
        const assistantMessageId = createCopilotMessageId('model');
        const history = writingCopilotMessages
            .filter((item) => item.status !== 'error' && item.content.trim())
            .map(({ role, content }) => ({ role, content }));

        updateWritingCopilotMessages((messages) => [
            ...messages,
            {
                id: createCopilotMessageId('user'),
                role: 'user',
                content: userMessage,
                createdAt: Date.now(),
                status: 'done',
            },
            {
                id: assistantMessageId,
                role: 'model',
                content: '',
                createdAt: Date.now(),
                status: 'streaming',
            },
        ]);

        setWritingCopilotDraftMessage('');
        setWritingCopilotErrorMessage(null);
        stopWritingCopilotStream();
        setWritingCopilotFocuses([]);

        const controller = new AbortController();
        writingCopilotAbortRef.current = controller;
        setWritingCopilotStreamingMessageId(assistantMessageId);

        try {
            await streamCopilotChat({
                payload: {
                    context: writingCopilotContext,
                    userMessage: outgoingUserMessage,
                    chatHistory: history,
                },
                signal: controller.signal,
                onEvent: (event) => {
                    if (event.event === 'chunk') {
                        const delta = typeof event.data.text === 'string' ? event.data.text : '';
                        if (!delta) {
                            return;
                        }

                        updateWritingCopilotMessages((messages) => (
                            messages.map((messageItem) => (
                                messageItem.id === assistantMessageId
                                    ? { ...messageItem, content: `${messageItem.content}${delta}` }
                                    : messageItem
                            ))
                        ));
                        return;
                    }

                    if (event.event === 'error') {
                        throw new Error(
                            typeof event.data.message === 'string'
                                ? event.data.message
                                : 'Không thể kết nối AI Copilot.',
                        );
                    }
                },
            });

            updateWritingCopilotMessages((messages) => (
                messages.map((messageItem) => (
                    messageItem.id === assistantMessageId
                        ? { ...messageItem, status: 'done' }
                        : messageItem
                ))
            ));
        } catch (error) {
            if (controller.signal.aborted) {
                updateWritingCopilotMessages((messages) => (
                    messages.flatMap((messageItem) => {
                        if (messageItem.id !== assistantMessageId) {
                            return [messageItem];
                        }

                        return messageItem.content.trim()
                            ? [{ ...messageItem, status: 'done' as const }]
                            : [];
                    })
                ));
                return;
            }

            const nextErrorMessage = error instanceof Error
                ? error.message
                : 'Không thể kết nối AI Copilot.';

            setWritingCopilotErrorMessage(nextErrorMessage);
            updateWritingCopilotMessages((messages) => (
                messages.flatMap((messageItem) => {
                    if (messageItem.id !== assistantMessageId) {
                        return [messageItem];
                    }

                    return messageItem.content.trim()
                        ? [{ ...messageItem, status: 'error' as const }]
                        : [];
                })
            ));
        } finally {
            if (writingCopilotAbortRef.current === controller) {
                writingCopilotAbortRef.current = null;
            }

            setWritingCopilotStreamingMessageId((current) => current === assistantMessageId ? null : current);
        }
    };

    useEffect(() => {
        if (!isWritingSession) {
            return;
        }

        const handleInsertSelectionShortcut = (event: KeyboardEvent) => {
            if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'l') {
                return;
            }

            const nextSelectedText = readSelectedReviewText();
            if (!nextSelectedText) {
                return;
            }

            event.preventDefault();
            setWritingCopilotSelectedText(nextSelectedText);
            if (!writingCopilotOpen) {
                setWritingCopilotErrorMessage(null);
                setWritingCopilotOpen(true);
                if (writingCopilotPreparationTimeoutRef.current != null) {
                    window.clearTimeout(writingCopilotPreparationTimeoutRef.current);
                    writingCopilotPreparationTimeoutRef.current = null;
                }

                if (writingCopilotPrepared) {
                    setWritingCopilotLoadingContext(false);
                } else {
                    setWritingCopilotLoadingContext(true);
                    writingCopilotPreparationTimeoutRef.current = window.setTimeout(() => {
                        setWritingCopilotPrepared(true);
                        setWritingCopilotLoadingContext(false);
                        writingCopilotPreparationTimeoutRef.current = null;
                    }, 520);
                }
            }
            setWritingCopilotComposerFocusSignal((current) => current + 1);
        };

        window.addEventListener('keydown', handleInsertSelectionShortcut, true);
        return () => window.removeEventListener('keydown', handleInsertSelectionShortcut, true);
    }, [isWritingSession, writingCopilotOpen, writingCopilotPrepared]);

    const writingCopilotSelectionChipLabel = useMemo(
        () => extractSelectionKeywords(writingCopilotSelectedText).join(', ') || 'trích đoạn đã chọn',
        [writingCopilotSelectedText],
    );

    return {
        writingCopilotOpen,
        writingCopilotPrepared,
        writingCopilotLoadingContext,
        writingCopilotErrorMessage,
        writingCopilotDraftMessage,
        writingCopilotMessages,
        writingCopilotSelectedText,
        writingCopilotFocuses,
        writingCopilotComposerFocusSignal,
        writingCopilotStreamingMessageId,
        writingCopilotLayout,
        writingCopilotContext,
        writingCopilotSelectionChipLabel,
        setWritingCopilotDraftMessage,
        setWritingCopilotFocuses,
        setWritingCopilotSelectedText,
        setWritingCopilotLayout,
        openWritingCopilot,
        handleCloseWritingCopilot,
        handleFocusWritingCopilotTask,
        handleSendWritingCopilotMessage,
        stopWritingCopilotStream,
    };
};

