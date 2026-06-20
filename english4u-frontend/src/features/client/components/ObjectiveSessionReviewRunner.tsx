import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Button,
    Card,
    Empty,
    Space,
    Typography,
    message,
} from 'antd';
import { BulbOutlined, RobotOutlined } from '@ant-design/icons';
import { createPortal } from 'react-dom';
import { streamCopilotChat } from '../api/copilot.api';
import { ReviewCopilotDrawer } from './ReviewCopilotDrawer';
import {
    buildListeningQuestionFocusPayload,
    buildObjectiveReviewCopilotContext,
    buildQuestionFocusPayload,
    findListeningQuestionFocusPayload,
    findReadingQuestionFocusPayload,
} from '../lib/reviewCopilotContext';
import {
    buildObjectiveAnswerMap,
    buildObjectiveReviewAnswerMap,
} from '../lib/sessionReviewHelpers';
import {
    buildCopilotOutgoingMessage,
    buildListeningReplayActionForQuestion,
    buildListeningReplayLookup,
    buildObjectiveWeaknessSummary,
    createCopilotMessageId,
    createListeningReplayAction,
    extractReferencedQuestionNumber,
    extractReferencedQuestionNumbers,
    extractRequestedReplayQuestionNumber,
    extractSelectionKeywords,
    getSharedListeningReviewAudioUrl,
    inferListeningQuestionNumberFromContextText,
    isAmbiguousListeningReplayRequest,
    isCorrectAnswerQuery,
    isObjectiveWeaknessSummaryIntent,
    mergeCopilotImages,
    readSelectedReviewText,
    resolveListeningReplayScopeBounds,
    resolveListeningTranscriptSnippetForReplay,
} from '../lib/reviewCopilotHelpers';
import { inferCopilotReplayMatchFromText } from '@/shared/lib/listeningTranscript';
import { isObjectiveSkill } from '../lib/sessionRouting';
import type { CopilotChatMessage, CopilotFocusPayload, CopilotReplayAction, ReviewCopilotContext } from '../types/copilot.types';
import type {
    PracticeSessionAnswerDto,
    PracticeSessionDto,
    PracticeSessionQuestionDto,
    PracticeSessionQuestionGroupDto,
} from '../types/session.types';
import { ListeningBody, ReadingBody } from '../pages/ClientObjectiveSessionRunnerPage';

const { Title, Text } = Typography;

export const ObjectiveSessionReviewRunner = ({
    session,
    onCopilotLayoutChange,
}: {
    session: PracticeSessionDto;
    onCopilotLayoutChange?: (state: { open: boolean; reservedWidth: number }) => void;
}) => {
    const skillType = session.skillType.trim().toUpperCase();
    const [activeItemIndex, setActiveItemIndex] = useState(0);
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
    const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
    const copilotAbortRef = useRef<AbortController | null>(null);
    const copilotPreparationTimeoutRef = useRef<number | null>(null);
    const reviewListeningAudioRef = useRef<HTMLAudioElement | null>(null);
    const replayStopAtRef = useRef<number | null>(null);

    const sections = useMemo(
        () => session.exam.sections.filter((section) => section.skillType.trim().toUpperCase() === skillType),
        [session.exam.sections, skillType],
    );

    const readingPassages = useMemo(
        () => sections.flatMap((section) => section.readingPassages),
        [sections],
    );

    const listeningParts = useMemo(
        () => sections.flatMap((section) => section.listeningParts),
        [sections],
    );
    const sharedListeningAudioUrl = useMemo(
        () => getSharedListeningReviewAudioUrl(listeningParts),
        [listeningParts],
    );

    const navigationItems = skillType === 'READING' ? readingPassages : listeningParts;
    const answerMap = useMemo(() => buildObjectiveAnswerMap(session), [session]);
    const reviewAnswerMap = useMemo(() => buildObjectiveReviewAnswerMap(session), [session]);
    const baseCopilotContext = useMemo(
        () => buildObjectiveReviewCopilotContext({
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
            contextImages: mergeCopilotImages(baseCopilotContext.contextImages, ...copilotFocuses.map((focus) => focus.images)),
        }),
        [baseCopilotContext, focusSummaryLabel, focusSummaryText, copilotFocuses, copilotSelectedText],
    );
    const copilotSelectionChipLabel = useMemo(
        () => extractSelectionKeywords(copilotSelectedText).join(', ') || 'trích đoạn đã chọn',
        [copilotSelectedText],
    );

    useEffect(() => {
        if (skillType !== 'LISTENING') {
            replayStopAtRef.current = null;
            return;
        }

        const audioElement = reviewListeningAudioRef.current;
        if (!audioElement) {
            return;
        }

        const handleTimeUpdate = () => {
            const stopAtSecond = replayStopAtRef.current;
            if (stopAtSecond == null || audioElement.currentTime < stopAtSecond) {
                return;
            }

            replayStopAtRef.current = null;
            audioElement.pause();
        };

        audioElement.addEventListener('timeupdate', handleTimeUpdate);
        return () => audioElement.removeEventListener('timeupdate', handleTimeUpdate);
    }, [headerSlot, sharedListeningAudioUrl, skillType]);

    useEffect(() => {
        setActiveItemIndex((current) => {
            if (navigationItems.length === 0) {
                return 0;
            }

            return Math.min(current, navigationItems.length - 1);
        });
    }, [navigationItems.length]);

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
        setHeaderSlot(document.getElementById('client-page-header-slot'));
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

    const handlePlayReplayAction = (action: CopilotReplayAction) => {
        const audioElement = reviewListeningAudioRef.current;
        if (!audioElement) {
            message.warning('Audio review chưa sẵn sàng để phát lại.');
            return;
        }

        const seekAndPlay = () => {
            replayStopAtRef.current = action.endAtSecond != null && action.endAtSecond > action.playAtSecond
                ? action.endAtSecond + 0.05
                : null;
            audioElement.currentTime = Math.max(0, action.playAtSecond);

            const playPromise = audioElement.play();
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch(() => {
                    message.warning('Trình duyệt chặn tự phát audio. Bạn bấm "Nghe lại đoạn này" thêm một lần để phát.');
                });
            }
        };

        if (audioElement.readyState >= 1) {
            seekAndPlay();
            return;
        }

        const handleLoadedMetadata = () => {
            audioElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
            seekAndPlay();
        };

        audioElement.addEventListener('loadedmetadata', handleLoadedMetadata);
        audioElement.load();
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

            const effectiveCopilotContext = (() => {
                if (skillType === 'LISTENING') {
                    const referencedQuestionNumber = extractReferencedQuestionNumber(
                        userMessage,
                        copilotContext.focusedQuestionNumber,
                    )
                        ?? inferListeningQuestionNumberFromContextText({
                            parts: listeningParts,
                            text: copilotSelectedText,
                        })
                        ?? inferListeningQuestionNumberFromContextText({
                            parts: listeningParts,
                            text: userMessage,
                        });
                    if (referencedQuestionNumber == null) {
                        return copilotContext;
                    }

                    const listeningQuestionFocus = findListeningQuestionFocusPayload({
                        parts: listeningParts,
                        questionNumber: referencedQuestionNumber,
                        answerMap,
                        reviewAnswerMap,
                    });
                    if (!listeningQuestionFocus) {
                        return copilotContext;
                    }

                    return {
                        ...copilotContext,
                        currentFocusLabel: listeningQuestionFocus.label,
                        currentFocusText: listeningQuestionFocus.text,
                        focusedQuestionNumber: listeningQuestionFocus.questionNumber ?? referencedQuestionNumber,
                        contextImages: mergeCopilotImages(copilotContext.contextImages, listeningQuestionFocus.images),
                    };
                }

                if (skillType === 'READING') {
                    const referencedQuestionNumbers = extractReferencedQuestionNumbers(
                        userMessage,
                        copilotContext.focusedQuestionNumber,
                    );
                    if (referencedQuestionNumbers.length === 0) {
                        return copilotContext;
                    }

                    const readingQuestionFocuses = referencedQuestionNumbers
                        .map((questionNumber) => findReadingQuestionFocusPayload({
                            passages: readingPassages,
                            questionNumber,
                            answerMap,
                            reviewAnswerMap,
                        }))
                        .filter((focus): focus is CopilotFocusPayload => !!focus);

                    if (readingQuestionFocuses.length === 0) {
                        return copilotContext;
                    }

                    const firstFocus = readingQuestionFocuses[0];
                    const focusLabel = readingQuestionFocuses.length === 1
                        ? firstFocus.label
                        : `Câu ${referencedQuestionNumbers.join(', ')}`;
                    const focusText = readingQuestionFocuses.length === 1
                        ? firstFocus.text
                        : readingQuestionFocuses
                            .map((focus) => `=== ${focus.label} ===\n${focus.text}`)
                            .join('\n\n');

                    return {
                        ...copilotContext,
                        currentFocusLabel: focusLabel,
                        currentFocusText: focusText,
                        focusedQuestionNumber: readingQuestionFocuses.length === 1
                            ? firstFocus.questionNumber ?? referencedQuestionNumbers[0]
                            : null,
                        contextImages: mergeCopilotImages(copilotContext.contextImages, ...readingQuestionFocuses.map((focus) => focus.images)),
                    };
                }

                return copilotContext;
            })();
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
                                ?? (
                                    skillType === 'LISTENING' && sharedListeningAudioUrl
                                        ? (() => {
                                            const authoritativeReplayQuestionNumber = requestedReplayQuestionNumber
                                                ?? effectiveCopilotContext.focusedQuestionNumber
                                                ?? null;
                                            if (authoritativeReplayQuestionNumber == null) {
                                                return null;
                                            }

                                            const inferredReplay = inferCopilotReplayMatchFromText(accumulatedContent);
                                            if (!inferredReplay) {
                                                return localReplayAction;
                                            }

                                            const replayQuestionNumber = authoritativeReplayQuestionNumber;
                                            const inferredQuestionMatchesRequest = inferredReplay.questionNumber == null
                                                || inferredReplay.questionNumber === authoritativeReplayQuestionNumber;

                                            if (inferredReplay.answerStartSecond != null && inferredQuestionMatchesRequest) {
                                                if (localReplayAction && isCorrectAnswerQuery(userMessage)) {
                                                    const isClose = Math.abs(inferredReplay.answerStartSecond - localReplayAction.playAtSecond) <= 15;
                                                    if (!isClose) {
                                                        return localReplayAction;
                                                    }
                                                }

                                                const transcriptSnippet = resolveListeningTranscriptSnippetForReplay({
                                                    parts: listeningParts,
                                                    activePartIndex: activeItemIndex,
                                                    answerStartSecond: inferredReplay.answerStartSecond,
                                                    answerEndSecond: inferredReplay.answerEndSecond,
                                                    questionNumber: replayQuestionNumber,
                                                }) ?? inferredReplay.transcriptSnippet;
                                                const replayScopeBounds = resolveListeningReplayScopeBounds({
                                                    parts: listeningParts,
                                                    activePartIndex: activeItemIndex,
                                                    questionNumber: replayQuestionNumber,
                                                });

                                                return createListeningReplayAction({
                                                    audioUrl: sharedListeningAudioUrl,
                                                    answerStartSecond: inferredReplay.answerStartSecond,
                                                    answerEndSecond: inferredReplay.answerEndSecond,
                                                    replayStartLimitSecond: replayScopeBounds?.startSecond,
                                                    replayEndLimitSecond: replayScopeBounds?.endSecond,
                                                    transcriptSnippet,
                                                    questionNumber: replayQuestionNumber,
                                                });
                                            }

                                            if (requestedReplayQuestionNumber != null) {
                                                const exactReplayAction = buildListeningReplayActionForQuestion({
                                                    parts: listeningParts,
                                                    activePartIndex: activeItemIndex,
                                                    questionNumber: requestedReplayQuestionNumber,
                                                    reviewAnswerMap,
                                                });

                                                if (exactReplayAction) {
                                                    return exactReplayAction;
                                                }
                                            }

                                            if (inferredReplay.questionNumber != null && inferredQuestionMatchesRequest) {
                                                const exactReplayAction = buildListeningReplayActionForQuestion({
                                                    parts: listeningParts,
                                                    activePartIndex: activeItemIndex,
                                                    questionNumber: inferredReplay.questionNumber,
                                                    reviewAnswerMap,
                                                });

                                                if (exactReplayAction) {
                                                    return exactReplayAction;
                                                }
                                            }

                                            return localReplayAction;
                                        })()
                                        : null
                                )
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

    const handleNavigationItemChange = (index: number) => {
        setActiveItemIndex(index);
        window.requestAnimationFrame(() => {
            document.getElementById('runner-active-section')?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
                inline: 'nearest',
            });
        });
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

    const renderQuestionAction = isObjectiveSkill(session.skillType)
        ? ({
            group,
            question,
            reviewAnswer,
            compact,
        }: {
            group: PracticeSessionQuestionGroupDto;
            question: PracticeSessionQuestionDto;
            reviewAnswer?: PracticeSessionAnswerDto;
            compact?: boolean;
        }) => {
            return (
                <Button
                    size="small"
                    icon={<RobotOutlined style={{ color: '#8b5cf6' }} />}
                    onClick={() => handleFocusQuestionCopilot({ group, question, reviewAnswer })}
                    className="hover:scale-102 hover:shadow-md transition-all duration-200"
                    style={{
                        borderRadius: 999,
                        fontWeight: 600,
                        borderColor: '#c084fc',
                        background: 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)',
                        color: '#7e22ce',
                        boxShadow: '0 4px 10px rgba(168, 85, 247, 0.08)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                    }}
                >
                    {compact ? 'Hỏi AI' : 'Hỏi AI Gia sư'}
                </Button>
            );
        }
        : undefined;

    const reviewListeningAudioNode = skillType === 'LISTENING' && sharedListeningAudioUrl
        ? (
            <div
                style={{
                    minWidth: 0,
                    width: 'clamp(180px, 28vw, 320px)',
                    maxWidth: '100%',
                    flex: '1 1 180px',
                }}
            >
                <audio
                    ref={reviewListeningAudioRef}
                    controls
                    controlsList="nodownload noplaybackrate"
                    preload="auto"
                    src={sharedListeningAudioUrl}
                    style={{
                        width: '100%',
                        maxWidth: '100%',
                        display: 'block',
                    }}
                />
            </div>
        )
        : null;

    if (navigationItems.length === 0) {
        return (
            <Card style={{ borderRadius: 22 }}>
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có dữ liệu đề để xem lại." />
            </Card>
        );
    }

    return (
        <>
            {headerSlot ? createPortal(
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        alignItems: 'center',
                        minWidth: 0,
                        width: 'auto',
                        maxWidth: '100%',
                        overflow: 'hidden',
                        flex: '0 0 auto',
                    }}
                >
                    <Button
                        type="text"
                        onClick={() => (copilotOpen ? handleCloseCopilot() : openCopilot(null))}
                        style={{
                            height: 40,
                            marginLeft: 10,
                            paddingInline: 16,
                            borderRadius: 999,
                            border: copilotOpen ? '1px solid #93c5fd' : '1px solid #dbeafe',
                            background: copilotOpen
                                ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)'
                                : 'linear-gradient(135deg, #ffffff 0%, #f8fbff 100%)',
                            color: '#1d4ed8',
                            fontWeight: 700,
                            boxShadow: copilotOpen
                                ? '0 8px 18px rgba(59, 130, 246, 0.18)'
                                : '0 6px 14px rgba(15, 23, 42, 0.06)',
                            flexShrink: 0,
                            whiteSpace: 'nowrap',
                        }}
                    >
                        <Space size={8}>
                            <BulbOutlined />
                            <span>AI gia sư</span>
                        </Space>
                    </Button>
                </div>,
                headerSlot,
            ) : null}

            <Space direction="vertical" size={16} style={{ width: '100%' }}>
                {reviewListeningAudioNode ? (
                    <div
                        style={{
                            border: '1px solid #dbeafe',
                            borderRadius: 16,
                            padding: 12,
                            background: '#f8fbff',
                        }}
                    >
                        <Space direction="vertical" size={6} style={{ width: '100%' }}>
                            <Text type="secondary">Audio review listening</Text>
                            {reviewListeningAudioNode}
                        </Space>
                    </div>
                ) : null}

                <Card style={{ borderRadius: 22 }}>
                    <Space direction="vertical" size={16} style={{ width: '100%' }}>
                        <div>
                            <Title level={4} style={{ margin: 0 }}>Xem lại bài làm</Title>
                        </div>

                        <div className="runner-review-shell">
                            <style>{`
                            .runner-review-shell .runner-split-layout {
                                display: grid;
                                grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
                                align-items: stretch;
                                height: calc(100vh - 190px);
                                min-height: 560px;
                            }

                            .runner-review-shell .runner-split-pane {
                                min-width: 0;
                                height: 100%;
                                overflow-y: auto;
                                overscroll-behavior: contain;
                                padding-bottom: 18px !important;
                            }

                            .runner-review-shell .runner-split-pane::-webkit-scrollbar {
                                width: 8px;
                            }

                            .runner-review-shell .runner-split-pane::-webkit-scrollbar-track {
                                background: transparent;
                            }

                            .runner-review-shell .runner-split-pane::-webkit-scrollbar-thumb {
                                background: rgba(148, 163, 184, 0.42);
                                border-radius: 999px;
                            }

                            @media (max-width: 1100px) {
                                .runner-review-shell .runner-split-layout {
                                    grid-template-columns: 1fr;
                                    height: auto;
                                }

                                .runner-review-shell .runner-split-pane {
                                    height: auto;
                                    max-height: none !important;
                                    overflow: visible !important;
                                    padding-bottom: 20px !important;
                                }
                            }
                        `}</style>

                            {skillType === 'READING' ? (
                                <ReadingBody
                                    passages={readingPassages}
                                    activePassageIndex={activeItemIndex}
                                    answerMap={answerMap}
                                    reviewAnswerMap={reviewAnswerMap}
                                    readOnly
                                    onAnswerChange={() => undefined}
                                    renderQuestionAction={renderQuestionAction}
                                />
                            ) : (
                                <ListeningBody
                                    parts={listeningParts}
                                    activePartIndex={activeItemIndex}
                                    answerMap={answerMap}
                                    reviewAnswerMap={reviewAnswerMap}
                                    readOnly
                                    onAnswerChange={() => undefined}
                                    renderQuestionAction={renderQuestionAction}
                                />
                            )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                            <Card
                                size="small"
                                styles={{ body: { padding: 0 } }}
                                style={{
                                    width: 'fit-content',
                                    borderRadius: 0,
                                    border: '1px solid #dbeafe',
                                    boxShadow: '0 6px 16px rgba(15, 23, 42, 0.08)',
                                    overflow: 'hidden',
                                }}
                            >
                                <div style={{ display: 'flex' }}>
                                    {navigationItems.map((item, index) => {
                                        const itemNumber = skillType === 'READING'
                                            ? ('passageNumber' in item ? item.passageNumber : index + 1)
                                            : ('partNumber' in item ? item.partNumber : index + 1);
                                        const isActive = index === activeItemIndex;

                                        return (
                                            <Button
                                                key={item.id}
                                                type="text"
                                                onClick={() => handleNavigationItemChange(index)}
                                                style={{
                                                    borderRadius: 0,
                                                    minWidth: 40,
                                                    height: 34,
                                                    paddingInline: 14,
                                                    borderRight: index === navigationItems.length - 1 ? 'none' : '1px solid #e2e8f0',
                                                    background: isActive ? '#111827' : '#fff',
                                                    color: isActive ? '#fff' : '#0f172a',
                                                    fontWeight: 800,
                                                }}
                                            >
                                                {itemNumber ?? index + 1}
                                            </Button>
                                        );
                                    })}
                                </div>
                            </Card>
                        </div>
                    </Space>
                </Card>
            </Space>

            <ReviewCopilotDrawer
                open={copilotOpen}
                loadingContext={copilotLoadingContext}
                context={copilotContext}
                messages={copilotMessages}
                draftMessage={copilotDraftMessage}
                isStreaming={!!copilotStreamingMessageId}
                errorMessage={copilotErrorMessage}
                focusComposerSignal={copilotComposerFocusSignal}
                focusChips={copilotFocuses}
                onClose={handleCloseCopilot}
                onDraftChange={setCopilotDraftMessage}
                onSendMessage={handleSendCopilotMessage}
                onStopStreaming={stopCopilotStream}
                onClearFocus={() => setCopilotFocuses([])}
                onRemoveFocus={(focusToRemove) => setCopilotFocuses((current) => current.filter((focus) => (
                    focus.questionNumber != null && focusToRemove.questionNumber != null
                        ? focus.questionNumber !== focusToRemove.questionNumber
                        : focus.label !== focusToRemove.label
                )))}
                onClearSelection={() => setCopilotSelectedText('')}
                selectionChipLabel={copilotSelectionChipLabel}
                onReservedWidthChange={setCopilotReservedWidth}
                onPlayReplayAction={handlePlayReplayAction}
            />
        </>
    );
};
