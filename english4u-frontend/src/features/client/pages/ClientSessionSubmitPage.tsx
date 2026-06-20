import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Col,
    Empty,
    Row,
    Space,
    Statistic,
    Tag,
    Typography,
    message,
} from 'antd';
import { ArrowLeftOutlined, BulbOutlined, ReloadOutlined, SendOutlined, RobotOutlined } from '@ant-design/icons';
import { createPortal } from 'react-dom';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { streamCopilotChat } from '../api/copilot.api';
import {
    usePracticeSessionQuery,
    useRescoreSpeakingMutation,
    useStartPracticeSessionMutation,
    useSubmitReadingListeningMutation,
    useSubmitSpeakingMutation,
    useSubmitWritingMutation,
} from '../api/session.api';
import { ReviewCopilotDrawer } from '../components/ReviewCopilotDrawer';
import { ListeningAttemptModeModal } from '../components/ListeningAttemptModeModal';
import { SpeakingSessionReview } from '../components/speaking/SpeakingSessionReview';
import { ObjectiveSessionReviewRunner } from '../components/ObjectiveSessionReviewRunner';
import {
    buildWritingReviewCopilotContext,
    buildWritingTaskFocusPayload,
} from '../lib/reviewCopilotContext';
import { setListeningAttemptMode, type ListeningAttemptMode } from '../lib/listeningSessionState';
import { getSessionRunnerPath, getSkillLabel, isObjectiveSkill, isSpeakingSkill, isSupportedRunnerSkill, isWritingSkill } from '../lib/sessionRouting';
import { formatDateTimeToMinute } from '@/shared/lib/dateTime';
import type { CopilotChatMessage, CopilotFocusPayload, ReviewCopilotContext } from '../types/copilot.types';
import type {
    PracticeSessionFeedbackDto,
} from '../types/session.types';
import {
    WRITING_SUBMIT_MIN_WORDS,
    countWords,
    formatRewardSummary,
    formatSeconds,
    getInvalidWritingTaskNumbers,
    getSessionStatusLabel,
    getWeightedWritingFeedbackByCriteria,
    getWritingAnswerMap,
    getWritingFeedbacks,
    getWritingReviewAnswerMap,
    getWritingTaskChartData,
    getWritingTaskFeedbackSections,
    getWritingTasks,
    parseWritingAssets,
    writingCriteriaGuideMap,
    writingCriteriaLabels,
} from '../lib/sessionReviewHelpers';
import {
    buildCopilotOutgoingMessage,
    createCopilotMessageId,
    dedupeCopilotFocuses,
    extractSelectionKeywords,
    mergeCopilotImages,
    readSelectedReviewText,
} from '../lib/reviewCopilotHelpers';

const { Title, Paragraph, Text } = Typography;

const CLIENT_LAYOUT_CONTENT_GUTTER = 24;

type WritingCorrection = {
    start_index?: number | null;
    end_index?: number | null;
    original_text?: string | null;
    corrected_text?: string | null;
    explanation?: string | null;
    criteria?: string | null;
};

const parseWritingOverallFeedback = (value?: string | null): { tasks?: Array<{ task_number?: number; feedback?: string; detailed_corrections?: WritingCorrection[] }> } | null => {
    if (!value) {
        return null;
    }

    try {
        return JSON.parse(value) as { tasks?: Array<{ task_number?: number; feedback?: string; detailed_corrections?: WritingCorrection[] }> };
    } catch {
        return null;
    }
};

const WritingRadarChart = ({ feedbacks, compact = false }: { feedbacks: PracticeSessionFeedbackDto[]; compact?: boolean }) => {
    const orderedFeedbacks = feedbacks;
    const size = compact ? 260 : 300;
    const center = size / 2;
    const radius = compact ? 72 : 86;
    const labelRadius = compact ? 106 : 122;
    const labelFontSize = compact ? 10 : 12;
    const valueFontSize = compact ? 10 : 11;
    const levels = [0.25, 0.5, 0.75, 1];
    const points = orderedFeedbacks.map((feedback, index) => {
        const angle = -Math.PI / 2 + (index * 2 * Math.PI) / orderedFeedbacks.length;
        const valueRadius = radius * Math.min(9, Math.max(0, feedback.bandScore)) / 9;
        return {
            x: center + valueRadius * Math.cos(angle),
            y: center + valueRadius * Math.sin(angle),
            labelX: center + labelRadius * Math.cos(angle),
            labelY: center + labelRadius * Math.sin(angle),
            label: writingCriteriaLabels[feedback.criteria] ?? feedback.criteria,
            value: feedback.bandScore,
        };
    });

    const gridPolygons = levels.map((level) => {
        const gridPoints = orderedFeedbacks.map((_, index) => {
            const angle = -Math.PI / 2 + (index * 2 * Math.PI) / orderedFeedbacks.length;
            return `${center + radius * level * Math.cos(angle)},${center + radius * level * Math.sin(angle)}`;
        });
        return gridPoints.join(' ');
    });

    return (
        <div style={{ width: '100%', maxWidth: compact ? 260 : 420, margin: '0 auto' }}>
            <svg width="100%" viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
                {gridPolygons.map((polygon, index) => (
                    <polygon key={polygon} points={polygon} fill="none" stroke={index === gridPolygons.length - 1 ? '#fdba74' : '#fed7aa'} strokeWidth={1} />
                ))}
                {orderedFeedbacks.map((_, index) => {
                    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / orderedFeedbacks.length;
                    return (
                        <line
                            key={index}
                            x1={center}
                            y1={center}
                            x2={center + radius * Math.cos(angle)}
                            y2={center + radius * Math.sin(angle)}
                            stroke="#fed7aa"
                            strokeWidth={1}
                        />
                    );
                })}
                <polygon
                    points={points.map((point) => `${point.x},${point.y}`).join(' ')}
                    fill="rgba(217,119,6,0.24)"
                    stroke="#d97706"
                    strokeWidth={2}
                />
                {points.map((point) => (
                    <g key={point.label}>
                        <circle cx={point.x} cy={point.y} r={4} fill="#d97706" />
                        <text x={point.labelX} y={point.labelY} textAnchor="middle" dominantBaseline="middle" fontSize={labelFontSize} fontWeight={700} fill="#92400e">
                            {point.label}
                        </text>
                        <text x={point.labelX} y={point.labelY + 14} textAnchor="middle" dominantBaseline="middle" fontSize={valueFontSize} fill="#64748b">
                            {point.value.toFixed(1)}
                        </text>
                    </g>
                ))}
            </svg>
        </div>
    );
};

export const ClientSessionSubmitPage = () => {
    const navigate = useNavigate();
    const { sessionId = '' } = useParams();
    const [searchParams] = useSearchParams();
    const autoSubmit = searchParams.get('auto') === '1';
    const autoSubmitTriggeredRef = useRef(false);
    const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
    const [objectiveReviewLayout, setObjectiveReviewLayout] = useState({ open: false, reservedWidth: 0 });
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
    const [pendingListeningRestart, setPendingListeningRestart] = useState(false);
    const writingCopilotAbortRef = useRef<AbortController | null>(null);
    const writingCopilotPreparationTimeoutRef = useRef<number | null>(null);

    const { data: session, isLoading, isError, refetch } = usePracticeSessionQuery(sessionId);
    const submitMutation = useSubmitReadingListeningMutation();
    const submitWritingMutation = useSubmitWritingMutation();
    const submitSpeakingMutation = useSubmitSpeakingMutation();
    const rescoreSpeakingMutation = useRescoreSpeakingMutation();
    const startSessionMutation = useStartPracticeSessionMutation();

    useEffect(() => {
        const canAutoSubmitWriting = isWritingSkill(session?.skillType) && session?.status === 'Submitted' && session.result?.writingScore == null;
        const canAutoSubmitSpeaking = isSpeakingSkill(session?.skillType) && session?.status === 'Submitted' && session.result?.speakingScore == null;
        if (!autoSubmit || autoSubmitTriggeredRef.current || !session || (!canAutoSubmitWriting && !canAutoSubmitSpeaking && session.status !== 'InProgress') || !isSupportedRunnerSkill(session.skillType)) {
            return;
        }

        autoSubmitTriggeredRef.current = true;
        if (isWritingSkill(session.skillType)) {
            const invalidTasks = getInvalidWritingTaskNumbers(session);
            if (invalidTasks.length > 0) {
                message.warning(`Chưa thể tự động nộp Writing vì Task ${invalidTasks.join(', ')} chưa đủ ${WRITING_SUBMIT_MIN_WORDS} từ.`);
                return;
            }
        }

        const mutation = isWritingSkill(session.skillType)
            ? submitWritingMutation
            : isSpeakingSkill(session.skillType)
                ? submitSpeakingMutation
                : submitMutation;
        mutation.mutate(sessionId, {
            onSuccess: (submitResult) => {
                refetch();
                const rewardSummary = formatRewardSummary(submitResult.reward);
                message.success(
                    isWritingSkill(session.skillType)
                        ? (rewardSummary ? `Writing đã chấm xong. ${rewardSummary}` : 'Writing đã chấm xong.')
                        : isSpeakingSkill(session.skillType)
                            ? (rewardSummary ? `Speaking đã chấm xong. ${rewardSummary}` : 'Speaking đã chấm xong.')
                            : (rewardSummary ? `Đã tự động nộp bài. ${rewardSummary}` : 'Đã tự động nộp bài.'),
                );
            },
            onError: (error: any) => {
                refetch();
                const errorMessage = error?.response?.data?.message || 'Không thể nộp/chấm bài. Bạn hãy thử lại.';
                message.error(errorMessage);
            },
        });
    }, [autoSubmit, session, sessionId, refetch, submitMutation, submitSpeakingMutation, submitWritingMutation]);

    useEffect(() => {
        setHeaderSlot(document.getElementById('client-page-header-slot'));
    }, []);

    const isWritingSession = isWritingSkill(session?.skillType);
    const isSpeakingSession = isSpeakingSkill(session?.skillType);
    const showObjectiveReview = isObjectiveSkill(session?.skillType) && session?.status === 'Completed';
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
        if (!showObjectiveReview) {
            setObjectiveReviewLayout({ open: false, reservedWidth: 0 });
        }
    }, [showObjectiveReview, session?.sessionId]);

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

    const latestMutationResult = isWritingSession
        ? submitWritingMutation.data
        : isSpeakingSession
            ? submitSpeakingMutation.data
            : submitMutation.data;
    const latestReward = latestMutationResult?.reward ?? null;
    const result = session?.result ?? latestMutationResult ?? null;
    const canRetryWritingScore = isWritingSession && session?.status === 'Submitted' && result?.writingScore == null;
    const canSubmitNow = !!session && (session.status === 'InProgress' || canRetryWritingScore) && isSupportedRunnerSkill(session.skillType);
    const activeSubmitLoading = isWritingSession ? submitWritingMutation.isPending : submitMutation.isPending;
    const writingScoreReady = isWritingSession && result?.writingScore != null;
    const writingScoringFinished = isWritingSession && session?.status === 'Completed';
    const showWritingScoringView = isWritingSession
        && (
            (activeSubmitLoading && !writingScoringFinished)
            || (session?.status === 'Submitted' && !writingScoreReady)
        );
    const canUseWritingCopilot = isWritingSession && writingScoreReady && !showWritingScoringView;
    const writingCopilotSelectionChipLabel = useMemo(
        () => extractSelectionKeywords(writingCopilotSelectedText).join(', ') || 'trích đoạn đã chọn',
        [writingCopilotSelectedText],
    );
    const activeReviewLayout = showObjectiveReview
        ? objectiveReviewLayout
        : (canUseWritingCopilot ? writingCopilotLayout : { open: false, reservedWidth: 0 });
    const reviewPanelBleedRight = activeReviewLayout.open ? CLIENT_LAYOUT_CONTENT_GUTTER : 0;
    const reservedReviewWidth = activeReviewLayout.reservedWidth > 0
        ? Math.max(activeReviewLayout.reservedWidth - reviewPanelBleedRight, 0)
        : 0;
    const writingScoringStages = [
        'Đang gửi bài viết đến AI để bắt đầu chấm điểm...',
        'AI đang đọc đề bài và bài viết của học viên...',
        'AI đang đánh giá bố cục, từ vựng và ngữ pháp...',
        'AI đang tổng hợp band score và feedback chi tiết...',
    ];
    const [writingScoringPhaseIndex, setWritingScoringPhaseIndex] = useState(0);

    useEffect(() => {
        if (!showWritingScoringView) {
            setWritingScoringPhaseIndex(0);
            return;
        }

        const interval = window.setInterval(() => {
            setWritingScoringPhaseIndex((current) => current + 1);
        }, 1600);

        return () => window.clearInterval(interval);
    }, [showWritingScoringView]);

    useEffect(() => {
        if (!isWritingSession || activeSubmitLoading || session?.status !== 'Submitted' || result?.writingScore != null) {
            return;
        }

        const interval = window.setInterval(() => {
            refetch();
        }, 5000);

        return () => window.clearInterval(interval);
    }, [activeSubmitLoading, isWritingSession, refetch, result?.writingScore, session?.status]);

    useEffect(() => {
        if (!canUseWritingCopilot) {
            setWritingCopilotOpen(false);
        }
    }, [canUseWritingCopilot]);

    useEffect(() => {
        if (!isWritingSession || session?.status !== 'Completed') {
            return;
        }

        submitWritingMutation.reset();
    }, [isWritingSession, session?.status, submitWritingMutation]);

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

    if (isLoading) {
        return (
            <Card style={{ borderRadius: 24 }}>
                <Paragraph style={{ margin: 0 }}>Dang tai session...</Paragraph>
            </Card>
        );
    }

    if (isError || !session) {
        return (
            <Card style={{ borderRadius: 24 }}>
                <Empty
                    description="Khong tim thay session can nop bai."
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                >
                    <Button type="primary" onClick={() => navigate('/app/my-exams')}>
                        Quay ve Bai thi cua toi
                    </Button>
                </Empty>
            </Card>
        );
    }

    if (isSpeakingSession) {
        const canRescoreSpeaking = session.status !== 'InProgress';
        const canSubmitSpeaking = session.status === 'InProgress' || canRescoreSpeaking;
        const speakingActionLoading = submitSpeakingMutation.isPending || rescoreSpeakingMutation.isPending;

        return (
            <SpeakingSessionReview
                session={session}
                result={result}
                submitLoading={speakingActionLoading}
                canSubmitNow={canSubmitSpeaking}
                headerSlot={headerSlot}
                onSubmit={() => {
                    const mutation = canRescoreSpeaking ? rescoreSpeakingMutation : submitSpeakingMutation;
                    mutation.mutate(sessionId, {
                        onSuccess: (submitResult) => {
                            refetch();
                            const rewardSummary = formatRewardSummary(submitResult.reward);
                            message.success(
                                canRescoreSpeaking
                                    ? (rewardSummary ? `Đã chấm lại Speaking. ${rewardSummary}` : 'Đã chấm lại Speaking.')
                                    : (rewardSummary ? `Đã nộp bài Speaking. ${rewardSummary}` : 'Đã nộp bài Speaking.'),
                            );
                        },
                        onError: (error: any) => {
                            refetch();
                            message.error(error?.response?.data?.message || 'Không thể nộp/chấm Speaking. Bạn hãy thử lại.');
                        },
                    });
                }}
                onBackToRunner={() => navigate(getSessionRunnerPath(session.sessionId, session.skillType))}
                onBackToLibrary={() => navigate('/app/my-exams')}
            />
        );
    }
    const writingTasks = getWritingTasks(session);
    const writingAnswerMap = getWritingAnswerMap(session);
    const submittedWritingTasks = writingTasks.filter((task) => countWords(writingAnswerMap[task.id]) >= WRITING_SUBMIT_MIN_WORDS).length;
    const writingFeedbacks = getWritingFeedbacks(session);
    const orderedWritingFeedbacks = getWeightedWritingFeedbackByCriteria(session);
    const writingTaskChartData = getWritingTaskChartData(session);
    const writingTaskFeedbackSections = getWritingTaskFeedbackSections(session);
    const writingTaskSubmissions = writingTasks.map((task, index) => {
        const answerText = writingAnswerMap[task.id] ?? '';
        return {
            key: task.id,
            taskNumber: task.taskNumber ?? index + 1,
            promptText: task.promptText,
            imageUrls: parseWritingAssets(task.assetsData),
            minWords: task.minWords,
            answerText,
            wordCount: countWords(answerText),
        };
    });
    const parsedWritingFeedback = parseWritingOverallFeedback(result?.overallFeedback ?? session.result?.overallFeedback);
    const writingCorrections = parsedWritingFeedback?.tasks?.flatMap((task) => task.detailed_corrections ?? []) ?? [];
    const progressLabel = isWritingSession
        ? `${submittedWritingTasks}/${writingTasks.length} task`
        : `${session.answeredQuestions}/${session.totalQuestions} câu`;
    const showStackedObjectiveSummary = showObjectiveReview && objectiveReviewLayout.open;
    const mainColLg = isWritingSession ? 12 : (showStackedObjectiveSummary ? 24 : 15);
    const resultColLg = isWritingSession ? 12 : (showStackedObjectiveSummary ? 24 : 9);
    const objectiveAccuracyValue = `${result?.accuracyPercent ?? 0}%`;
    const objectiveSkillLabel = getSkillLabel(session.skillType);
    const objectiveBandValue = result?.totalBandScore != null ? result.totalBandScore.toFixed(1) : '—';
    const objectiveRawScoreValue = result
        ? `${result.totalAutoScore.toFixed(1)}/${result.maxAutoScore.toFixed(1)}`
        : '0.0';
    const summaryInfoCards = [
        { key: 'startedAt', label: 'Bắt đầu', value: formatDateTimeToMinute(session.startedAt) || 'N/A' },
        { key: 'endedAt', label: 'Kết thúc', value: formatDateTimeToMinute(session.endedAt) || 'Chưa nộp' },
        { key: 'timer', label: 'Thời gian còn lại', value: formatSeconds(session.timeRemaining) },
        { key: 'progress', label: 'Tiến độ', value: progressLabel },
    ];
    const objectiveStatCards = [
        { key: 'band', label: 'Band IELTS', value: objectiveBandValue, accent: '#2563eb', tone: '#eff6ff' },
        { key: 'score', label: 'Raw score', value: objectiveRawScoreValue, accent: '#0891b2', tone: '#ecfeff' },
        { key: 'correct', label: 'Câu đúng', value: String(result?.correctQuestions ?? 0), accent: '#16a34a', tone: '#f0fdf4' },
        { key: 'accuracy', label: 'Độ chính xác', value: objectiveAccuracyValue, accent: '#7c3aed', tone: '#f5f3ff' },
    ];

    const updateWritingCopilotMessages = (updater: (messages: CopilotChatMessage[]) => CopilotChatMessage[]) => {
        setWritingCopilotMessages((current) => updater(current));
    };

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

    const handleStartNewAttempt = (attemptMode?: ListeningAttemptMode) => {
        startSessionMutation.mutate(
            { examId: session.examId, forceNew: true },
            {
                onSuccess: (nextSession) => {
                    if (attemptMode) {
                        setListeningAttemptMode(nextSession.sessionId, attemptMode);
                    }
                    message.success('Đã tạo lượt làm bài mới.');
                    navigate(getSessionRunnerPath(nextSession.sessionId, nextSession.skillType));
                },
            },
        );
    };

    const handleSubmit = () => {
        if (!canSubmitNow) {
            return;
        }

        if (isWritingSession) {
            const invalidTasks = getInvalidWritingTaskNumbers(session);
            if (invalidTasks.length > 0) {
                message.warning(`Task ${invalidTasks.join(', ')} cần tối thiểu ${WRITING_SUBMIT_MIN_WORDS} từ trước khi nộp.`);
                return;
            }

            submitWritingMutation.mutate(sessionId, {
                onSuccess: (submitResult) => {
                    refetch();
                    const rewardSummary = formatRewardSummary(submitResult.reward);
                    message.success(rewardSummary ? `Đã chấm xong Writing. ${rewardSummary}` : 'Đã chấm xong Writing.');
                },
                onError: (error: any) => {
                    refetch();
                    const backendMessage = error?.response?.data?.message;
                    const isTimeout = error?.code === 'ECONNABORTED';
                    const errorMessage = backendMessage
                        || (isTimeout
                            ? 'Request chấm Writing quá thời gian chờ. Bấm chấm lại Writing để thử lại.'
                            : 'Không thể chấm Writing. Kiểm tra backend log/API key rồi thử lại.');
                    message.error(errorMessage);
                },
            });
            return;
        }

        if (isObjectiveSkill(session.skillType)) {
            submitMutation.mutate(sessionId, {
                onSuccess: (submitResult) => {
                    refetch();
                    const rewardSummary = formatRewardSummary(submitResult.reward);
                    message.success(rewardSummary ? `Đã nộp bài. ${rewardSummary}` : 'Đã nộp bài thành công.');
                },
            });
        }
    };

    return (
        <>
            {headerSlot ? createPortal(
                <>
                    <style>{`
                        .session-submit-page-toolbar {
                            display: flex;
                            align-items: center;
                            gap: 12px;
                            width: auto;
                            min-width: 0;
                            height: 100%;
                            flex: 1 1 0;
                            overflow: hidden;
                        }

                        .session-submit-back-button {
                            width: 40px;
                            height: 40px;
                            flex: 0 0 40px;
                            border-radius: 12px;
                            border: 1px solid #dbeafe;
                            background: linear-gradient(135deg, #ffffff 0%, #f8fbff 100%);
                            color: #0f172a;
                            box-shadow: 0 4px 14px rgba(15, 23, 42, 0.06);
                        }

                        .session-submit-title-block {
                            display: flex;
                            align-items: center;
                            gap: 10px;
                            min-width: 0;
                            flex: 1 1 auto;
                            overflow: hidden;
                        }

                        .session-submit-title-accent {
                            width: 10px;
                            height: 32px;
                            border-radius: 999px;
                            background: linear-gradient(180deg, #2563eb 0%, #60a5fa 100%);
                            box-shadow: 0 6px 16px rgba(37, 99, 235, 0.28);
                            flex: 0 0 10px;
                        }

                        .session-submit-page-title {
                            min-width: 0;
                            flex: 1 1 auto;
                            overflow: hidden;
                            text-overflow: ellipsis;
                            white-space: nowrap;
                            font-size: 1.1rem;
                            font-weight: 800;
                            color: #0f172a;
                        }

                        .session-submit-header-meta {
                            display: flex;
                            align-items: center;
                            gap: 8px;
                            flex: 0 0 auto;
                            flex-wrap: nowrap;
                            min-width: max-content;
                        }

                        .session-submit-header-chip {
                            display: inline-flex;
                            align-items: center;
                            gap: 6px;
                            height: 34px;
                            padding: 0 12px;
                            border-radius: 999px;
                            border: 1px solid #dbeafe;
                            background: #ffffff;
                            color: #1e293b;
                            font-size: 0.85rem;
                            font-weight: 700;
                            white-space: nowrap;
                        }

                        .session-submit-skill-chip {
                            border-color: #93c5fd;
                            background: #eff6ff;
                            color: #1d4ed8;
                        }

                        .session-submit-status-chip {
                            border-color: #bbf7d0;
                            background: #f0fdf4;
                            color: #16a34a;
                        }

                        .session-submit-header-action {
                            flex: 0 0 auto;
                            height: 40px;
                            border-radius: 12px;
                            box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
                        }

                        .session-submit-header-progress {
                            position: relative;
                            display: inline-flex;
                            align-items: center;
                            gap: 10px;
                            min-width: 196px;
                            height: 40px;
                            padding: 0 16px;
                            border-radius: 14px;
                            border: 1px solid #bfdbfe;
                            background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
                            color: #1d4ed8;
                            font-weight: 800;
                            box-shadow: 0 8px 20px rgba(37, 99, 235, 0.14);
                            overflow: hidden;
                        }

                        .session-submit-header-progress::after {
                            content: "";
                            position: absolute;
                            left: 12px;
                            right: 12px;
                            bottom: 6px;
                            height: 4px;
                            border-radius: 999px;
                            background: rgba(191, 219, 254, 0.95);
                        }

                        .session-submit-header-progress-bar {
                            position: absolute;
                            left: 12px;
                            bottom: 6px;
                            width: 42%;
                            height: 4px;
                            border-radius: 999px;
                            background: linear-gradient(90deg, #2563eb 0%, #38bdf8 100%);
                            animation: session-submit-progress-slide 1.6s ease-in-out infinite;
                            z-index: 1;
                        }

                        .session-submit-header-progress-dot {
                            width: 10px;
                            height: 10px;
                            border-radius: 999px;
                            background: #2563eb;
                            box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.28);
                            animation: session-submit-progress-pulse 1.6s ease-in-out infinite;
                        }

                        @keyframes session-submit-progress-slide {
                            0% { transform: translateX(-16%); }
                            50% { transform: translateX(92%); }
                            100% { transform: translateX(-16%); }
                        }

                        @keyframes session-submit-progress-pulse {
                            0%, 100% { transform: scale(0.9); box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.18); }
                            50% { transform: scale(1); box-shadow: 0 0 0 10px rgba(37, 99, 235, 0); }
                        }

                        @media (max-width: 980px) {
                            .session-submit-page-toolbar {
                                gap: 8px;
                            }

                            .session-submit-title-accent,
                            .session-submit-status-chip {
                                display: none;
                            }

                            .session-submit-page-title {
                                font-size: 0.92rem;
                            }

                            .session-submit-header-action {
                                padding-inline: 12px;
                            }
                        }

                        @media (max-width: 760px) {
                            .session-submit-skill-chip {
                                display: none;
                            }
                        }
                    `}</style>
                    <div className="session-submit-page-toolbar">
                        <Button
                            type="text"
                            className="session-submit-back-button"
                            icon={<ArrowLeftOutlined />}
                            aria-label="Quay lại bài thi của tôi"
                            title="Bài thi của tôi"
                            onClick={() => navigate('/app/my-exams')}
                        />
                        <div className="session-submit-title-block">
                            <span className="session-submit-title-accent" />
                            <div className="session-submit-page-title" title={session.examTitle}>
                                {session.examTitle}
                            </div>
                        </div>
                        <div className="session-submit-header-meta">
                            <span className="session-submit-header-chip session-submit-skill-chip">{getSkillLabel(session.skillType)}</span>
                            <span className="session-submit-header-chip session-submit-status-chip">{getSessionStatusLabel(session.status)}</span>
                        </div>
                        {showWritingScoringView ? (
                            <div className="session-submit-header-progress">
                                <span className="session-submit-header-progress-dot" />
                                <span>AI đang chấm</span>
                                <span className="session-submit-header-progress-bar" />
                            </div>
                        ) : canSubmitNow ? (
                            <Button
                                type="primary"
                                className="session-submit-header-action"
                                icon={<SendOutlined />}
                                loading={activeSubmitLoading}
                                onClick={handleSubmit}
                            >
                                {canRetryWritingScore ? 'Chấm lại' : 'Nộp bài'}
                            </Button>
                        ) : (
                            <Button
                                className="session-submit-header-action"
                                icon={<ReloadOutlined />}
                                loading={startSessionMutation.isPending}
                                onClick={() => {
                                    if (session.skillType.trim().toUpperCase() === 'LISTENING') {
                                        setPendingListeningRestart(true);
                                        return;
                                    }

                                    handleStartNewAttempt();
                                }}
                            >
                                Làm lại
                            </Button>
                        )}
                    </div>
                </>,
                headerSlot,
            ) : null}

            {headerSlot && canUseWritingCopilot ? createPortal(
                <Button
                    type="text"
                    onClick={() => (writingCopilotOpen ? handleCloseWritingCopilot() : openWritingCopilot(null))}
                    style={{
                        height: 40,
                        marginLeft: 10,
                        paddingInline: 16,
                        borderRadius: 999,
                        border: writingCopilotOpen ? '1px solid #93c5fd' : '1px solid #dbeafe',
                        background: writingCopilotOpen
                            ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)'
                            : 'linear-gradient(135deg, #ffffff 0%, #f8fbff 100%)',
                        color: '#1d4ed8',
                        fontWeight: 700,
                        boxShadow: writingCopilotOpen
                            ? '0 8px 18px rgba(59, 130, 246, 0.18)'
                            : '0 6px 14px rgba(15, 23, 42, 0.06)',
                        flexShrink: 0,
                    }}
                >
                    <Space size={8}>
                        <BulbOutlined />
                        <span>AI gia sư</span>
                    </Space>
                </Button>,
                headerSlot,
            ) : null}

            <div
                style={{
                    width: reviewPanelBleedRight > 0 ? `calc(100% + ${reviewPanelBleedRight}px)` : '100%',
                    marginRight: reviewPanelBleedRight > 0 ? -reviewPanelBleedRight : 0,
                    paddingRight: reservedReviewWidth,
                    transition: 'padding-right 0.22s ease',
                }}
            >
                <Space direction="vertical" size={20} style={{ width: '100%' }}>
                    {latestReward ? (
                        <Alert
                            type={latestReward.experienceAwarded > 0 ? 'success' : 'info'}
                            showIcon
                            message={latestReward.levelUpOccurred
                                ? `Lên cấp thành công: Lv.${latestReward.currentLevel}`
                                : `Tiến trình đã cập nhật: Lv.${latestReward.currentLevel}`}
                            description={latestReward.experienceAwarded > 0
                                ? `Bạn nhận +${latestReward.experienceAwarded} XP. Streak hiện tại là ${latestReward.dailyStreakCount} ngày liên tiếp.`
                                : `Đề này đã được cộng XP từ lần hoàn thành trước. Streak hiện tại là ${latestReward.dailyStreakCount} ngày liên tiếp.`}
                            style={{
                                borderRadius: 18,
                                border: latestReward.experienceAwarded > 0 ? '1px solid #bbf7d0' : '1px solid #bfdbfe',
                                boxShadow: '0 12px 28px rgba(15, 23, 42, 0.06)',
                            }}
                        />
                    ) : null}

                    {showWritingScoringView ? (
                        <Card
                            style={{
                                borderRadius: 24,
                                border: '1px solid #bfdbfe',
                                background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 52%, #f8fbff 100%)',
                                overflow: 'hidden',
                            }}
                        >
                            <style>{`
                                @keyframes writing-scoring-glow {
                                    0% { transform: translateX(-35%); opacity: 0.2; }
                                    50% { opacity: 0.95; }
                                    100% { transform: translateX(165%); opacity: 0.2; }
                                }
                            `}</style>
                            <Space direction="vertical" size={20} style={{ width: '100%' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                                    <div style={{ minWidth: 0, maxWidth: 760 }}>
                                        <Text
                                            style={{
                                                display: 'inline-block',
                                                marginBottom: 10,
                                                fontSize: 12,
                                                fontWeight: 800,
                                                letterSpacing: '0.08em',
                                                textTransform: 'uppercase',
                                                color: '#2563eb',
                                            }}
                                        >
                                            AI đang chấm bài Writing
                                        </Text>
                                        <Title level={3} style={{ margin: 0, color: '#0f172a' }}>
                                            Bài viết đã được lưu, đang chờ band score và feedback
                                        </Title>
                                        <Paragraph style={{ margin: '10px 0 0', color: '#475569', maxWidth: 720 }}>
                                            Hệ thống đang tự động chấm bài theo các tiêu chí IELTS Writing. Bạn chưa cần hỏi AI ở bước này; kết quả và nút AI gia sư sẽ xuất hiện sau khi chấm xong.
                                        </Paragraph>
                                    </div>
                                    <div
                                        style={{
                                            padding: '10px 14px',
                                            borderRadius: 999,
                                            border: '1px solid #bfdbfe',
                                            background: '#ffffff',
                                            color: '#1d4ed8',
                                            fontWeight: 800,
                                            boxShadow: '0 10px 24px rgba(37, 99, 235, 0.08)',
                                        }}
                                    >
                                        {submittedWritingTasks}/{writingTasks.length} task đã lưu
                                    </div>
                                </div>

                                <div
                                    style={{
                                        position: 'relative',
                                        height: 18,
                                        borderRadius: 999,
                                        background: 'rgba(191, 219, 254, 0.45)',
                                        overflow: 'hidden',
                                        border: '1px solid #dbeafe',
                                    }}
                                >
                                    <div
                                        style={{
                                            position: 'absolute',
                                            inset: 0,
                                            width: `${activeSubmitLoading ? 34 + (writingScoringPhaseIndex % 3) * 9 : 64 + (writingScoringPhaseIndex % 5) * 5}%`,
                                            borderRadius: 999,
                                            background: 'linear-gradient(90deg, #2563eb 0%, #38bdf8 100%)',
                                            transition: 'width 1.2s ease',
                                        }}
                                    />
                                    <div
                                        style={{
                                            position: 'absolute',
                                            top: 0,
                                            bottom: 0,
                                            width: '36%',
                                            background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.55) 50%, rgba(255,255,255,0) 100%)',
                                            animation: 'writing-scoring-glow 2.2s linear infinite',
                                        }}
                                    />
                                </div>

                                <div
                                    style={{
                                        padding: 18,
                                        borderRadius: 20,
                                        border: '1px solid #dbeafe',
                                        background: '#ffffff',
                                        boxShadow: '0 12px 28px rgba(15, 23, 42, 0.05)',
                                    }}
                                >
                                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                                        <Text strong style={{ color: '#0f172a', fontSize: 16 }}>
                                            {writingScoringStages[writingScoringPhaseIndex % writingScoringStages.length]}
                                        </Text>
                                        <Row gutter={[12, 12]}>
                                            {[
                                                'Phân tích đề bài',
                                                'Đánh giá nội dung',
                                                'Kiểm tra từ vựng và ngữ pháp',
                                                'Tổng hợp điểm và feedback',
                                            ].map((step, index) => {
                                                const isActive = index === (writingScoringPhaseIndex % 4);
                                                const isCompleted = index < (writingScoringPhaseIndex % 4);

                                                return (
                                                    <Col xs={24} sm={12} md={6} key={step}>
                                                        <div
                                                            style={{
                                                                height: '100%',
                                                                padding: 14,
                                                                borderRadius: 16,
                                                                border: isActive
                                                                    ? '1px solid #93c5fd'
                                                                    : isCompleted
                                                                        ? '1px solid #bbf7d0'
                                                                        : '1px solid #e2e8f0',
                                                                background: isActive
                                                                    ? '#eff6ff'
                                                                    : isCompleted
                                                                        ? '#f0fdf4'
                                                                        : '#f8fafc',
                                                            }}
                                                        >
                                                            <Text strong style={{ color: isActive ? '#1d4ed8' : isCompleted ? '#15803d' : '#334155' }}>
                                                                {step}
                                                            </Text>
                                                        </div>
                                                    </Col>
                                                );
                                            })}
                                        </Row>
                                    </Space>
                                </div>
                            </Space>
                        </Card>
                    ) : null}

                    {!showWritingScoringView ? (
                        <Row gutter={[16, 16]}>
                            <Col xs={24} lg={mainColLg}>
                                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                                    <Card style={{ borderRadius: 22 }}>
                                        <Space direction="vertical" size={16} style={{ width: '100%' }}>
                                            {canSubmitNow ? (
                                                <Alert
                                                    type="warning"
                                                    showIcon
                                                    message={canRetryWritingScore ? 'Writing đã nộp nhưng chưa có điểm' : (isWritingSession ? 'Bạn sắp nộp bài Writing' : 'Bạn sắp nộp bài objective')}
                                                    description={canRetryWritingScore
                                                        ? 'Bạn có thể bấm chấm lại để gọi AI scoring cho bài đã lưu.'
                                                        : isWritingSession
                                                            ? `Mỗi task cần tối thiểu ${WRITING_SUBMIT_MIN_WORDS} từ. Sau khi nộp, hệ thống sẽ gọi AI để chấm Writing.`
                                                            : 'Sau khi nộp, session sẽ chuyển sang Completed và hiện kết quả objective ngay tại trang này.'}
                                                />
                                            ) : isWritingSession ? (
                                                <Alert
                                                    type="success"
                                                    showIcon
                                                    message="Bài Writing đã được nộp"
                                                    description={result?.writingScore != null
                                                        ? 'AI đã trả điểm và feedback Writing.'
                                                        : 'Bài viết đã được lưu. Nếu chưa có điểm, kiểm tra cấu hình Gemini/API key hoặc thử nộp lại.'}
                                                />
                                            ) : null}

                                            <div
                                                style={{
                                                    padding: 22,
                                                    borderRadius: 22,
                                                    border: '1px solid #dbeafe',
                                                    background: 'linear-gradient(135deg, #f8fbff 0%, #ffffff 48%, #f0fdf4 100%)',
                                                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
                                                }}
                                            >
                                                <Space direction="vertical" size={18} style={{ width: '100%' }}>
                                                    <div
                                                        style={{
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            gap: 16,
                                                            alignItems: 'flex-start',
                                                            flexWrap: 'wrap',
                                                        }}
                                                    >
                                                        <div style={{ minWidth: 0 }}>
                                                            <Text
                                                                style={{
                                                                    display: 'inline-block',
                                                                    marginBottom: 8,
                                                                    fontSize: 12,
                                                                    fontWeight: 800,
                                                                    letterSpacing: '0.08em',
                                                                    textTransform: 'uppercase',
                                                                    color: '#2563eb',
                                                                }}
                                                            >
                                                                Tổng quan bài làm
                                                            </Text>
                                                            <Title level={3} style={{ margin: 0, color: '#0f172a' }}>
                                                                {session.examTitle}
                                                            </Title>
                                                            <Paragraph style={{ margin: '8px 0 0', color: '#475569' }}>
                                                                Kỹ năng <b>{objectiveSkillLabel}</b> · Trạng thái <b>{getSessionStatusLabel(session.status)}</b>
                                                            </Paragraph>
                                                        </div>
                                                        <Space wrap size={[8, 8]}>
                                                            <Tag
                                                                style={{
                                                                    margin: 0,
                                                                    padding: '6px 12px',
                                                                    borderRadius: 999,
                                                                    borderColor: '#93c5fd',
                                                                    background: '#eff6ff',
                                                                    color: '#1d4ed8',
                                                                    fontWeight: 700,
                                                                }}
                                                            >
                                                                {objectiveSkillLabel}
                                                            </Tag>
                                                            <Tag
                                                                style={{
                                                                    margin: 0,
                                                                    padding: '6px 12px',
                                                                    borderRadius: 999,
                                                                    borderColor: '#bbf7d0',
                                                                    background: '#f0fdf4',
                                                                    color: '#15803d',
                                                                    fontWeight: 700,
                                                                }}
                                                            >
                                                                {getSessionStatusLabel(session.status)}
                                                            </Tag>
                                                        </Space>
                                                    </div>

                                                    <Row gutter={[12, 12]}>
                                                        {summaryInfoCards.map((item) => (
                                                            <Col xs={24} sm={12} key={item.key}>
                                                                <div
                                                                    style={{
                                                                        height: '100%',
                                                                        padding: 16,
                                                                        borderRadius: 18,
                                                                        border: '1px solid #e2e8f0',
                                                                        background: 'rgba(255,255,255,0.92)',
                                                                    }}
                                                                >
                                                                    <Text style={{ display: 'block', color: '#64748b', fontSize: 13 }}>
                                                                        {item.label}
                                                                    </Text>
                                                                    <Text
                                                                        strong
                                                                        style={{
                                                                            display: 'block',
                                                                            marginTop: 6,
                                                                            fontSize: 18,
                                                                            color: '#0f172a',
                                                                            lineHeight: 1.45,
                                                                        }}
                                                                    >
                                                                        {item.value}
                                                                    </Text>
                                                                </div>
                                                            </Col>
                                                        ))}
                                                    </Row>
                                                </Space>
                                            </div>

                                            {canSubmitNow ? (
                                                <Space wrap>
                                                    <Button onClick={() => navigate(getSessionRunnerPath(session.sessionId, session.skillType))}>
                                                        Quay lai lam tiep
                                                    </Button>
                                                    <Button
                                                        type="primary"
                                                        icon={<SendOutlined />}
                                                        loading={activeSubmitLoading}
                                                        onClick={handleSubmit}
                                                    >
                                                        {canRetryWritingScore ? 'Chấm lại Writing' : 'Nộp bài ngay'}
                                                    </Button>
                                                </Space>
                                            ) : null}
                                        </Space>
                                    </Card>

                                    {isWritingSession && !showWritingScoringView && writingFeedbacks.length > 0 ? (
                                        <Card
                                            style={{
                                                borderRadius: 22,
                                                border: '1px solid #fed7aa',
                                                background: 'linear-gradient(135deg, #fffaf5 0%, #ffffff 100%)',
                                            }}
                                        >
                                            <Space direction="vertical" size={14} style={{ width: '100%' }}>
                                                <div>
                                                    <Title level={5} style={{ margin: 0 }}>4 tiêu chí chấm Writing</Title>
                                                    <Paragraph style={{ margin: '6px 0 0', color: '#78716c' }}>
                                                        Điểm tổng hợp theo đúng 4 tiêu chí IELTS Writing cho bài này.
                                                    </Paragraph>
                                                </div>

                                                <Row gutter={[12, 12]}>
                                                    {orderedWritingFeedbacks.map((feedback) => (
                                                        <Col xs={24} sm={12} key={feedback.criteria}>
                                                            <div
                                                                style={{
                                                                    height: '100%',
                                                                    padding: 16,
                                                                    borderRadius: 18,
                                                                    border: '1px solid #ffedd5',
                                                                    background: '#ffffff',
                                                                }}
                                                            >
                                                                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                                                                    <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
                                                                        <Text strong style={{ color: '#9a3412' }}>
                                                                            {feedback.criteria}
                                                                            {writingCriteriaLabels[feedback.criteria] ? ` (${writingCriteriaLabels[feedback.criteria]})` : ''}
                                                                        </Text>
                                                                        <Tag color="orange" style={{ marginInlineEnd: 0 }}>
                                                                            {feedback.bandScore > 0 ? feedback.bandScore.toFixed(1) : '—'}
                                                                        </Tag>
                                                                    </Space>
                                                                    {writingCriteriaGuideMap[feedback.criteria]?.length ? (
                                                                        <ul
                                                                            style={{
                                                                                margin: 0,
                                                                                paddingLeft: 18,
                                                                                color: '#57534e',
                                                                                lineHeight: 1.7,
                                                                            }}
                                                                        >
                                                                            {writingCriteriaGuideMap[feedback.criteria].map((item) => (
                                                                                <li key={item}>{item}</li>
                                                                            ))}
                                                                        </ul>
                                                                    ) : (
                                                                        <Text type="secondary">
                                                                            {feedback.comment || 'Chưa có diễn giải cho tiêu chí này.'}
                                                                        </Text>
                                                                    )}
                                                                </Space>
                                                            </div>
                                                        </Col>
                                                    ))}
                                                </Row>
                                            </Space>
                                        </Card>
                                    ) : null}
                                </Space>
                            </Col>

                            <Col xs={24} lg={resultColLg}>
                                <Card style={{ borderRadius: 22, height: '100%' }}>
                                    <Space direction="vertical" size={16} style={{ width: '100%' }}>
                                        {isWritingSession ? (
                                            <>
                                                <Title level={5} style={{ margin: 0 }}>Bài nộp Writing</Title>
                                                <Row gutter={[12, 12]}>
                                                    <Col span={12}>
                                                        <Statistic title="Task" value={`${submittedWritingTasks}/${writingTasks.length}`} />
                                                    </Col>
                                                    <Col span={12}>
                                                        <Statistic title="Band" value={result?.writingScore != null ? result.writingScore.toFixed(1) : '—'} />
                                                    </Col>
                                                </Row>
                                                {writingFeedbacks.length > 0 ? (
                                                    <>
                                                        <div style={{ textAlign: 'center' }}>
                                                            <Text strong>Tổng hợp 2 task</Text>
                                                            <br />
                                                            <Text type="secondary" style={{ fontSize: 12 }}>
                                                                Overall = (Task 1 x1 + Task 2 x2) / 3, làm tròn 0.5
                                                            </Text>
                                                        </div>
                                                        <WritingRadarChart feedbacks={orderedWritingFeedbacks} />
                                                        {writingTaskChartData.length > 0 ? (
                                                            <Row gutter={[12, 12]}>
                                                                {writingTaskChartData.map((task) => (
                                                                    <Col xs={24} md={12} key={task.key}>
                                                                        <Card
                                                                            size="small"
                                                                            title={`Task ${task.taskNumber}`}
                                                                            extra={<Tag color="orange">Band {task.band != null ? task.band.toFixed(1) : '—'}</Tag>}
                                                                            style={{
                                                                                borderRadius: 16,
                                                                                border: '1px solid #fed7aa',
                                                                                background: '#fffaf5',
                                                                            }}
                                                                        >
                                                                            <WritingRadarChart feedbacks={task.feedbacks} compact />
                                                                        </Card>
                                                                    </Col>
                                                                ))}
                                                            </Row>
                                                        ) : null}
                                                    </>
                                                ) : null}
                                                <Alert
                                                    type={result?.writingScore != null ? 'success' : 'warning'}
                                                    showIcon
                                                    message={result?.writingScore != null ? 'Đã có điểm Writing' : 'Chưa có điểm Writing'}
                                                    description={result?.writingScore != null
                                                        ? 'Mỗi task lấy trung bình 4 tiêu chí IELTS. Overall Writing dùng Task 1 hệ số 1 và Task 2 hệ số 2.'
                                                        : 'Bài đã lưu, nhưng chưa có kết quả AI. Kiểm tra backend log/API key nếu trạng thái không đổi.'}
                                                />
                                            </>
                                        ) : (
                                            <>
                                                <div
                                                    style={{
                                                        padding: 22,
                                                        borderRadius: 22,
                                                        background: 'linear-gradient(135deg, #0f172a 0%, #1d4ed8 58%, #38bdf8 100%)',
                                                        color: '#ffffff',
                                                        boxShadow: '0 18px 36px rgba(37, 99, 235, 0.24)',
                                                    }}
                                                >
                                                    <Text
                                                        style={{
                                                            display: 'inline-block',
                                                            color: 'rgba(255,255,255,0.8)',
                                                            fontSize: 12,
                                                            fontWeight: 800,
                                                            letterSpacing: '0.08em',
                                                            textTransform: 'uppercase',
                                                        }}
                                                    >
                                                        Kết quả bài trắc nghiệm
                                                    </Text>
                                                    <Title level={3} style={{ margin: '10px 0 8px', color: '#ffffff' }}>
                                                        {objectiveSkillLabel}
                                                    </Title>
                                                    <Paragraph style={{ margin: 0, color: 'rgba(255,255,255,0.82)' }}>
                                                        Bạn làm đúng <b style={{ color: '#ffffff' }}>{result?.correctQuestions ?? 0}</b> trên{' '}
                                                        <b style={{ color: '#ffffff' }}>{result?.totalQuestions ?? session.totalQuestions}</b> câu của bài này.
                                                    </Paragraph>

                                                    <div
                                                        style={{
                                                            marginTop: 18,
                                                            padding: 18,
                                                            borderRadius: 18,
                                                            background: 'rgba(255,255,255,0.12)',
                                                            border: '1px solid rgba(255,255,255,0.18)',
                                                            backdropFilter: 'blur(10px)',
                                                        }}
                                                    >
                                                        <Text style={{ display: 'block', color: 'rgba(255,255,255,0.72)', fontSize: 13 }}>
                                                            Band tổng kết
                                                        </Text>
                                                        <Text
                                                            strong
                                                            style={{
                                                                display: 'block',
                                                                marginTop: 4,
                                                                fontSize: 42,
                                                                lineHeight: 1.05,
                                                                color: '#ffffff',
                                                                letterSpacing: '-0.03em',
                                                            }}
                                                        >
                                                            {objectiveBandValue}
                                                        </Text>
                                                    </div>
                                                </div>

                                                <Row gutter={[12, 12]}>
                                                    {objectiveStatCards.map((item) => (
                                                        <Col xs={12} key={item.key}>
                                                            <div
                                                                style={{
                                                                    height: '100%',
                                                                    padding: 16,
                                                                    borderRadius: 18,
                                                                    border: '1px solid #e2e8f0',
                                                                    background: item.tone,
                                                                }}
                                                            >
                                                                <Text style={{ display: 'block', color: '#64748b', fontSize: 13 }}>
                                                                    {item.label}
                                                                </Text>
                                                                <Text
                                                                    strong
                                                                    style={{
                                                                        display: 'block',
                                                                        marginTop: 6,
                                                                        fontSize: 28,
                                                                        lineHeight: 1.1,
                                                                        color: item.accent,
                                                                    }}
                                                                >
                                                                    {item.value}
                                                                </Text>
                                                            </div>
                                                        </Col>
                                                    ))}
                                                </Row>
                                            </>
                                        )}
                                    </Space>
                                </Card>
                            </Col>
                        </Row>
                    ) : null}

                    {showObjectiveReview ? (
                        <ObjectiveSessionReviewRunner
                            session={session}
                            onCopilotLayoutChange={setObjectiveReviewLayout}
                        />
                    ) : null}

                    {isWritingSession ? (
                        <Card style={{ borderRadius: 22 }}>
                            <Space direction="vertical" size={16} style={{ width: '100%' }}>
                                <div>
                                    <Title level={4} style={{ margin: 0 }}>Bài viết đã lưu</Title>
                                    <Paragraph style={{ margin: '6px 0 0', color: '#64748b' }}>
                                        Nội dung dưới đây là bài viết đã được lưu từ lúc học viên làm bài.
                                    </Paragraph>
                                </div>

                                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                                    {writingTaskSubmissions.map((task) => (
                                        <Card
                                            key={task.key}
                                            size="small"
                                            title={`Task ${task.taskNumber}`}
                                            extra={(
                                                <Space wrap size={[8, 8]}>
                                                    <Tag color={task.wordCount >= task.minWords ? 'green' : 'orange'}>{task.wordCount} từ</Tag>
                                                    {canUseWritingCopilot ? (
                                                        <Button
                                                            size="small"
                                                            icon={<RobotOutlined style={{ color: '#8b5cf6' }} />}
                                                            onClick={() => handleFocusWritingCopilotTask(task.key)}
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
                                                            Hỏi AI gia sư
                                                        </Button>
                                                    ) : null}
                                                </Space>
                                            )}
                                            style={{
                                                borderRadius: 18,
                                                border: '1px solid #dbeafe',
                                                background: 'linear-gradient(135deg, #f8fbff 0%, #ffffff 100%)',
                                            }}
                                        >
                                            <Space direction="vertical" size={12} style={{ width: '100%' }}>
                                                <div
                                                    style={{
                                                        padding: 14,
                                                        borderRadius: 14,
                                                        background: '#f8fafc',
                                                        border: '1px solid #e2e8f0',
                                                    }}
                                                >
                                                    <Text strong>Đề bài</Text>
                                                    <Paragraph style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>
                                                        {task.promptText}
                                                    </Paragraph>
                                                </div>

                                                {task.imageUrls.length > 0 ? (
                                                    <div
                                                        style={{
                                                            padding: 14,
                                                            borderRadius: 14,
                                                            background: '#fff7ed',
                                                            border: '1px solid #fed7aa',
                                                        }}
                                                    >
                                                        <Text strong>Hình đề bài</Text>
                                                        <Space direction="vertical" size={12} style={{ width: '100%', marginTop: 10 }}>
                                                            {task.imageUrls.map((url) => (
                                                                <img
                                                                    key={url}
                                                                    src={url}
                                                                    alt={`Writing task ${task.taskNumber} visual`}
                                                                    style={{
                                                                        display: 'block',
                                                                        width: 'auto',
                                                                        maxWidth: '100%',
                                                                        maxHeight: 360,
                                                                        margin: '0 auto',
                                                                        borderRadius: 14,
                                                                        border: '1px solid #fdba74',
                                                                        objectFit: 'contain',
                                                                    }}
                                                                />
                                                            ))}
                                                        </Space>
                                                    </div>
                                                ) : null}

                                                <div
                                                    style={{
                                                        padding: 16,
                                                        borderRadius: 14,
                                                        background: '#ffffff',
                                                        border: '1px solid #dbeafe',
                                                        minHeight: 160,
                                                    }}
                                                >
                                                    <Text strong>Bài làm của học viên</Text>
                                                    {task.answerText.trim() ? (
                                                        <Paragraph style={{ margin: '10px 0 0', whiteSpace: 'pre-wrap', lineHeight: 1.75 }}>
                                                            {task.answerText}
                                                        </Paragraph>
                                                    ) : (
                                                        <Paragraph type="secondary" style={{ margin: '10px 0 0' }}>
                                                            Task này chưa có nội dung được lưu.
                                                        </Paragraph>
                                                    )}
                                                </div>
                                            </Space>
                                        </Card>
                                    ))}
                                </Space>
                            </Space>
                        </Card>
                    ) : null}

                    {isWritingSession && writingFeedbacks.length > 0 ? (
                        <Card style={{ borderRadius: 22 }}>
                            <Space direction="vertical" size={16} style={{ width: '100%' }}>
                                <div>
                                    <Title level={4} style={{ margin: 0 }}>Feedback IELTS Writing</Title>
                                    <Paragraph style={{ margin: '6px 0 0', color: '#64748b' }}>
                                        Feedback chi tiết theo từng part/task và 4 tiêu chí IELTS.
                                    </Paragraph>
                                </div>

                                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                                    {writingTaskFeedbackSections.map((task) => (
                                        <Card
                                            key={task.key}
                                            size="small"
                                            title={`Part ${task.taskNumber}`}
                                            extra={<Tag color="orange">Band {task.band != null ? task.band.toFixed(1) : '—'}</Tag>}
                                            style={{
                                                borderRadius: 18,
                                                border: '1px solid #fed7aa',
                                                background: 'linear-gradient(135deg, #fff7ed 0%, #ffffff 100%)',
                                            }}
                                        >
                                            <Row gutter={[14, 14]}>
                                                {task.feedbacks.map((feedback) => (
                                                    <Col xs={24} md={12} key={`${task.key}-${feedback.criteria}`}>
                                                        <Card
                                                            size="small"
                                                            style={{
                                                                borderRadius: 14,
                                                                border: '1px solid #ffedd5',
                                                                background: '#ffffff',
                                                                height: '100%',
                                                            }}
                                                        >
                                                            <Space direction="vertical" size={8} style={{ width: '100%' }}>
                                                                <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
                                                                    <Text strong>{feedback.criteria}</Text>
                                                                    <Tag color="orange">{feedback.bandScore > 0 ? feedback.bandScore.toFixed(1) : '—'}</Tag>
                                                                </Space>
                                                                {feedback.comment ? (
                                                                    <Text>{feedback.comment}</Text>
                                                                ) : (
                                                                    <Text type="secondary">Chưa có nhận xét cho tiêu chí này.</Text>
                                                                )}
                                                                {feedback.improvements ? (
                                                                    <Text type="secondary">
                                                                        <b>Cải thiện:</b> {feedback.improvements}
                                                                    </Text>
                                                                ) : null}
                                                            </Space>
                                                        </Card>
                                                    </Col>
                                                ))}
                                            </Row>
                                        </Card>
                                    ))}
                                </Space>

                                {writingCorrections.length > 0 ? (
                                    <Card
                                        size="small"
                                        title="Các lỗi AI gợi ý sửa"
                                        style={{ borderRadius: 16, border: '1px solid #e2e8f0' }}
                                    >
                                        <Space direction="vertical" size={10} style={{ width: '100%' }}>
                                            {writingCorrections.slice(0, 8).map((correction, index) => (
                                                <div
                                                    key={`${correction.start_index ?? index}-${correction.original_text ?? index}`}
                                                    style={{
                                                        padding: 12,
                                                        borderRadius: 12,
                                                        background: '#f8fafc',
                                                        border: '1px solid #e2e8f0',
                                                    }}
                                                >
                                                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                                                        {correction.criteria ? <Tag style={{ width: 'fit-content' }}>{correction.criteria}</Tag> : null}
                                                        {correction.original_text ? (
                                                            <Text delete style={{ color: '#b91c1c' }}>{correction.original_text}</Text>
                                                        ) : null}
                                                        {correction.corrected_text ? (
                                                            <Text style={{ color: '#15803d' }}>{correction.corrected_text}</Text>
                                                        ) : null}
                                                        {correction.explanation ? (
                                                            <Text type="secondary">{correction.explanation}</Text>
                                                        ) : null}
                                                    </Space>
                                                </div>
                                            ))}
                                        </Space>
                                    </Card>
                                ) : null}
                            </Space>
                        </Card>
                    ) : null}

                    {canUseWritingCopilot ? (
                        <ReviewCopilotDrawer
                            open={writingCopilotOpen}
                            loadingContext={writingCopilotLoadingContext}
                            context={writingCopilotContext}
                            messages={writingCopilotMessages}
                            draftMessage={writingCopilotDraftMessage}
                            isStreaming={!!writingCopilotStreamingMessageId}
                            errorMessage={writingCopilotErrorMessage}
                            focusComposerSignal={writingCopilotComposerFocusSignal}
                            focusChips={writingCopilotFocuses}
                            onClose={handleCloseWritingCopilot}
                            onDraftChange={setWritingCopilotDraftMessage}
                            onSendMessage={handleSendWritingCopilotMessage}
                            onStopStreaming={stopWritingCopilotStream}
                            onClearFocus={() => setWritingCopilotFocuses([])}
                            onRemoveFocus={(focusToRemove) => setWritingCopilotFocuses((current) => current.filter((focus) => (
                                focus.label !== focusToRemove.label
                            )))}
                            onClearSelection={() => setWritingCopilotSelectedText('')}
                            selectionChipLabel={writingCopilotSelectionChipLabel}
                            onReservedWidthChange={(nextWidth) => setWritingCopilotLayout({
                                open: nextWidth > 0,
                                reservedWidth: nextWidth,
                            })}
                        />
                    ) : null}
                </Space>
            </div>
            <ListeningAttemptModeModal
                open={pendingListeningRestart}
                loading={startSessionMutation.isPending}
                onCancel={() => setPendingListeningRestart(false)}
                onSelectMode={(mode) => {
                    setPendingListeningRestart(false);
                    handleStartNewAttempt(mode);
                }}
            />
        </>
    );
};
