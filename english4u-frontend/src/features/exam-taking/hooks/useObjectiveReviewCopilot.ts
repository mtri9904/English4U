import { useEffect, useMemo, useRef, useState } from 'react';
import { streamCopilotChat } from '../services/copilot.service';
import {
    buildListeningQuestionFocusPayload,
    buildObjectiveReviewCopilotContext,
    buildQuestionFocusPayload,
    findReadingQuestionFocusPayload,
} from '../utils/reviewCopilotContext.utils';
import {
    buildCopilotOutgoingMessage,
    buildListeningReplayLookup,
    buildObjectiveWeaknessSummary,
    createCopilotMessageId,
    extractRequestedReplayQuestionNumber,
    extractSelectionKeywords,
    isAmbiguousListeningReplayRequest,
    isObjectiveWeaknessSummaryIntent,
    mergeCopilotImages,
    readSelectedReviewText,
} from '../utils/reviewCopilot.utils';
import {
    resolveEffectiveContextForMessage,
    resolveStreamingReplayAction,
} from '../utils/reviewCopilotReplayResolver';
import { useCopilotAudioReplay } from './useCopilotAudioReplay';
import type { CopilotChatMessage, CopilotFocusPayload, ReviewCopilotContext } from '../types/copilot.types';
import type {
    PracticeSessionAnswerDto,
    PracticeSessionDto,
    PracticeSessionListeningPartDto,
    PracticeSessionQuestionDto,
    PracticeSessionQuestionGroupDto,
    PracticeSessionReadingPassageDto,
} from '../types/session.types';

interface UseObjectiveReviewCopilotProps {
    session: PracticeSessionDto;
    skillType: string;
    activeItemIndex: number;
    readingPassages: PracticeSessionReadingPassageDto[];
    listeningParts: PracticeSessionListeningPartDto[];
    sharedListeningAudioUrl?: string | null;
    answerMap: Record<string, string>;
    reviewAnswerMap: Record<string, PracticeSessionAnswerDto>;
    onCopilotLayoutChange?: (state: { open: boolean; reservedWidth: number }) => void;
}

export const useObjectiveReviewCopilot = ({
    session,
    skillType,
    activeItemIndex,
    readingPassages,
    listeningParts,
    sharedListeningAudioUrl,
    answerMap,
    reviewAnswerMap,
    onCopilotLayoutChange,
}: UseObjectiveReviewCopilotProps) => {
    const [copilotOpen, setCopilotOpen] = useState(false);
    const [copilotPrepared, setCopilotPrepared] = useState(false);
    const [copilotLoadingContext, setCopilotLoadingContext] = useState(false);
    const [copilotErrorMessage, setCopilotErrorMessage] = useState<string | null>(null);
    const [copilotDraftMessage, setCopilotDraftMessage] = useState('');
    const [copilotMessages, setCopilotMessages] = useState<CopilotChatMessage[]>([]);
    const [copilotSelectedText, setCopilotSelectedText] = useState('');
    const [copilotFocuses, setCopilotFocuses] = useState<CopilotFocusPayload[]>([]);
    const [copilotComposerFocusSignal, setCopilotComposerFocusSignal] = useState(0);
    const [copilotStreamingMessageId, setCopilotStreamingMessageId] = useState<string | null>(null);
    const [copilotReservedWidth, setCopilotReservedWidth] = useState(0);

    const copilotAbortRef = useRef<AbortController | null>(null);
    const copilotPreparationTimeoutRef = useRef<number | null>(null);

    const { reviewListeningAudioRef, handlePlayReplayAction } = useCopilotAudioReplay(
        skillType,
        sharedListeningAudioUrl,
    );

    const baseCopilotContext = useMemo(
        () =>
            buildObjectiveReviewCopilotContext({
                session,
                activeItemIndex,
                answerMap,
                reviewAnswerMap,
            }),
        [session, activeItemIndex, answerMap, reviewAnswerMap],
    );

    const focusSummaryLabel = useMemo(
        () => (copilotFocuses.length > 0 ? copilotFocuses.map((focus) => focus.label).join(', ') : null),
        [copilotFocuses],
    );

    const focusSummaryText = useMemo(
        () => (
            copilotFocuses.length > 0
                ? copilotFocuses.map((focus) => `=== ${focus.label} ===\n${focus.text}`).join('\n\n')
                : null
        ),
        [copilotFocuses],
    );

    const copilotContext = useMemo<ReviewCopilotContext>(
        () => ({
            ...baseCopilotContext,
            currentFocusLabel: focusSummaryLabel,
            currentFocusText: focusSummaryText,
            focusedQuestionNumber: copilotFocuses.length === 1 ? copilotFocuses[0].questionNumber ?? null : null,
            selectedText: copilotSelectedText || null,
            selectedTextLabel: copilotSelectedText ? 'Từ khóa trích đoạn' : null,
            contextImages: mergeCopilotImages(
                baseCopilotContext.contextImages,
                ...copilotFocuses.map((focus) => focus.images),
            ),
        }),
        [baseCopilotContext, focusSummaryLabel, focusSummaryText, copilotFocuses, copilotSelectedText],
    );

    const copilotSelectionChipLabel = useMemo(
        () => extractSelectionKeywords(copilotSelectedText).join(', ') || 'trích đoạn đã chọn',
        [copilotSelectedText],
    );

    useEffect(() => {
        setCopilotOpen(false);
        setCopilotPrepared(false);
        setCopilotLoadingContext(false);
        setCopilotErrorMessage(null);
        setCopilotDraftMessage('');
        setCopilotMessages([]);
        setCopilotSelectedText('');
        setCopilotFocuses([]);
        setCopilotStreamingMessageId(null);
        setCopilotReservedWidth(0);
        copilotAbortRef.current?.abort();
        if (copilotPreparationTimeoutRef.current != null) {
            window.clearTimeout(copilotPreparationTimeoutRef.current);
            copilotPreparationTimeoutRef.current = null;
        }
    }, [session.sessionId]);

    useEffect(() => () => {
        copilotAbortRef.current?.abort();
        if (copilotPreparationTimeoutRef.current != null) {
            window.clearTimeout(copilotPreparationTimeoutRef.current);
        }
    }, []);

    useEffect(() => {
        onCopilotLayoutChange?.({
            open: copilotOpen,
            reservedWidth: copilotOpen ? copilotReservedWidth : 0,
        });
    }, [copilotOpen, copilotReservedWidth, onCopilotLayoutChange]);

    const updateCopilotMessages = (updater: (messages: CopilotChatMessage[]) => CopilotChatMessage[]) => {
        setCopilotMessages((current) => updater(current));
    };

    const stopCopilotStream = () => {
        copilotAbortRef.current?.abort();
        copilotAbortRef.current = null;
        setCopilotStreamingMessageId(null);
    };

    const prepareCopilotIfNeeded = () => {
        if (copilotPreparationTimeoutRef.current != null) {
            window.clearTimeout(copilotPreparationTimeoutRef.current);
            copilotPreparationTimeoutRef.current = null;
        }

        if (copilotPrepared) {
            setCopilotLoadingContext(false);
            return;
        }

        setCopilotLoadingContext(true);
        copilotPreparationTimeoutRef.current = window.setTimeout(() => {
            setCopilotPrepared(true);
            setCopilotLoadingContext(false);
            copilotPreparationTimeoutRef.current = null;
        }, 520);
    };

    const openCopilot = (focus?: CopilotFocusPayload | null) => {
        setCopilotErrorMessage(null);
        setCopilotOpen(true);
        if (focus) {
            setCopilotFocuses([focus]);
        }
        prepareCopilotIfNeeded();
        setCopilotComposerFocusSignal((current) => current + 1);
    };

    const handleCloseCopilot = () => {
        stopCopilotStream();
        if (copilotPreparationTimeoutRef.current != null) {
            window.clearTimeout(copilotPreparationTimeoutRef.current);
            copilotPreparationTimeoutRef.current = null;
        }
        setCopilotLoadingContext(false);
        setCopilotErrorMessage(null);
        setCopilotOpen(false);
    };

    useEffect(() => {
        const handleInsertSelectionShortcut = (event: KeyboardEvent) => {
            if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'l') {
                return;
            }

            const nextSelectedText = readSelectedReviewText();
            if (!nextSelectedText) {
                return;
            }

            event.preventDefault();
            setCopilotSelectedText(nextSelectedText);
            if (!copilotOpen) {
                openCopilot();
                return;
            }
            setCopilotComposerFocusSignal((current) => current + 1);
        };

        window.addEventListener('keydown', handleInsertSelectionShortcut, true);
        return () => window.removeEventListener('keydown', handleInsertSelectionShortcut, true);
    }, [copilotOpen]);

    const handleSendCopilotMessage = async (userMessage: string) => {
        let controller: AbortController | null = null;
        let assistantMessageId: string | null = null;
        let accumulatedContent = '';

        try {
            if (!copilotContext || copilotLoadingContext) {
                return;
            }

            if (isObjectiveWeaknessSummaryIntent(userMessage, skillType)) {
                updateCopilotMessages((messages) => [
                    ...messages,
                    {
                        id: createCopilotMessageId('user'),
                        role: 'user',
                        content: userMessage,
                        createdAt: Date.now(),
                        status: 'done',
                        focusChips: copilotFocuses.length > 0 ? [...copilotFocuses] : null,
                        selectionLabel: copilotSelectedText ? 'Từ khóa trích đoạn' : null,
                    },
                    {
                        id: createCopilotMessageId('model'),
                        role: 'model',
                        content: buildObjectiveWeaknessSummary({
                            skillType,
                            readingPassages,
                            listeningParts,
                            answerMap,
                            reviewAnswerMap,
                        }),
                        createdAt: Date.now(),
                        status: 'done',
                    },
                ]);

                setCopilotDraftMessage('');
                setCopilotErrorMessage(null);
                stopCopilotStream();
                setCopilotFocuses([]);
                return;
            }

            if (skillType === 'LISTENING' && isAmbiguousListeningReplayRequest(userMessage, copilotContext.focusedQuestionNumber)) {
                updateCopilotMessages((messages) => [
                    ...messages,
                    {
                        id: createCopilotMessageId('user'),
                        role: 'user',
                        content: userMessage,
                        createdAt: Date.now(),
                        status: 'done',
                        focusChips: copilotFocuses.length > 0 ? [...copilotFocuses] : null,
                        selectionLabel: copilotSelectedText ? 'Từ khóa trích đoạn' : null,
                    },
                    {
                        id: createCopilotMessageId('model'),
                        role: 'model',
                        content: 'Mình chưa biết "câu này" là câu nào. Bạn hãy bấm `Hỏi AI Copilot` ngay tại đúng câu đó, hoặc nhập rõ số câu như `câu 1 nghe ở đoạn nào`.',
                        createdAt: Date.now(),
                        status: 'done',
                    },
                ]);

                setCopilotDraftMessage('');
                setCopilotErrorMessage(null);
                stopCopilotStream();
                return;
            }

            const effectiveCopilotContext = resolveEffectiveContextForMessage({
                skillType,
                userMessage,
                copilotContext,
                copilotSelectedText,
                listeningParts,
                readingPassages,
                answerMap,
                reviewAnswerMap,
            });

            const requestedReplayQuestionNumber = skillType === 'LISTENING'
                ? extractRequestedReplayQuestionNumber(
                    userMessage,
                    effectiveCopilotContext.focusedQuestionNumber,
                )
                : null;

            const localReplayAction = skillType === 'LISTENING'
                ? buildListeningReplayLookup({
                    parts: listeningParts,
                    activePartIndex: activeItemIndex,
                    message: userMessage,
                    focusedQuestionNumber: requestedReplayQuestionNumber ?? effectiveCopilotContext.focusedQuestionNumber,
                    reviewAnswerMap,
                })
                : null;

            const outgoingUserMessage = buildCopilotOutgoingMessage(userMessage, effectiveCopilotContext);
            assistantMessageId = createCopilotMessageId('model');
            const history = copilotMessages
                .filter((item) => item.status !== 'error' && item.content.trim())
                .map(({ role, content }) => ({ role, content }));

            updateCopilotMessages((messages) => [
                ...messages,
                {
                    id: createCopilotMessageId('user'),
                    role: 'user',
                    content: userMessage,
                    createdAt: Date.now(),
                    status: 'done',
                    focusChips: copilotFocuses.length > 0 ? [...copilotFocuses] : null,
                    selectionLabel: copilotSelectedText ? 'Từ khóa trích đoạn' : null,
                },
                {
                    id: assistantMessageId!,
                    role: 'model',
                    content: '',
                    createdAt: Date.now(),
                    status: 'streaming',
                },
            ]);

            setCopilotDraftMessage('');
            setCopilotErrorMessage(null);
            stopCopilotStream();
            setCopilotFocuses([]);

            controller = new AbortController();
            copilotAbortRef.current = controller;
            setCopilotStreamingMessageId(assistantMessageId);

            await streamCopilotChat({
                payload: {
                    context: effectiveCopilotContext,
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

                        accumulatedContent += delta;
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

            updateCopilotMessages((messages) => (
                messages.map((messageItem) => (
                    messageItem.id === assistantMessageId
                        ? {
                            ...messageItem,
                            status: 'done',
                            content: accumulatedContent,
                            replayAction: (
                                messageItem.replayAction
                                ?? resolveStreamingReplayAction({
                                    skillType,
                                    sharedListeningAudioUrl,
                                    accumulatedContent,
                                    requestedReplayQuestionNumber,
                                    effectiveCopilotContext,
                                    localReplayAction,
                                    userMessage,
                                    listeningParts,
                                    activeItemIndex,
                                    reviewAnswerMap,
                                })
                            ),
                        }
                        : messageItem
                ))
            ));
        } catch (error) {
            if (controller?.signal.aborted && assistantMessageId) {
                updateCopilotMessages((messages) => (
                    messages.flatMap((messageItem) => {
                        if (messageItem.id !== assistantMessageId) {
                            return [messageItem];
                        }

                        return accumulatedContent.trim()
                            ? [{ ...messageItem, status: 'done' as const, content: accumulatedContent }]
                            : [];
                    })
                ));
                return;
            }

            const nextErrorMessage = error instanceof Error
                ? error.message
                : 'Không thể kết nối AI Copilot.';

            setCopilotErrorMessage(nextErrorMessage);
            if (assistantMessageId) {
                updateCopilotMessages((messages) => (
                    messages.filter((messageItem) => messageItem.id !== assistantMessageId)
                ));
            }
        } finally {
            if (copilotAbortRef.current === controller) {
                copilotAbortRef.current = null;
            }

            if (assistantMessageId) {
                setCopilotStreamingMessageId((current) => current === assistantMessageId ? null : current);
            }
        }
    };

    const handleFocusQuestionCopilot = ({
        group,
        question,
        reviewAnswer,
    }: {
        group: PracticeSessionQuestionGroupDto;
        question: PracticeSessionQuestionDto;
        reviewAnswer?: PracticeSessionAnswerDto;
    }) => {
        const nextFocus = skillType === 'LISTENING'
            ? buildListeningQuestionFocusPayload({
                parts: listeningParts,
                group,
                question,
                reviewAnswer,
                userAnswer: answerMap[question.id] ?? reviewAnswer?.answerText,
            })
            : skillType === 'READING' && question.questionNumber != null
                ? findReadingQuestionFocusPayload({
                    passages: readingPassages,
                    questionNumber: question.questionNumber,
                    answerMap,
                    reviewAnswerMap,
                }) ?? buildQuestionFocusPayload({
                    group,
                    question,
                    reviewAnswer,
                    userAnswer: answerMap[question.id] ?? reviewAnswer?.answerText,
                })
                : buildQuestionFocusPayload({
                    group,
                    question,
                    reviewAnswer,
                    userAnswer: answerMap[question.id] ?? reviewAnswer?.answerText,
                });

        openCopilot(nextFocus);
    };

    return {
        copilotOpen,
        copilotPrepared,
        copilotLoadingContext,
        copilotErrorMessage,
        copilotDraftMessage,
        copilotMessages,
        copilotSelectedText,
        copilotFocuses,
        copilotComposerFocusSignal,
        copilotStreamingMessageId,
        copilotReservedWidth,
        copilotContext,
        copilotSelectionChipLabel,
        reviewListeningAudioRef,
        setCopilotDraftMessage,
        setCopilotFocuses,
        setCopilotSelectedText,
        setCopilotReservedWidth,
        openCopilot,
        handleCloseCopilot,
        handleSendCopilotMessage,
        stopCopilotStream,
        handlePlayReplayAction,
        handleFocusQuestionCopilot,
    };
};
