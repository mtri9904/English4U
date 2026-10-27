import { useEffect, useRef, useState } from 'react';
import {
    Button,
    Card,
    Col,
    Empty,
    Row,
    Space,
    Typography,
    message,
} from 'antd';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
    usePracticeSessionQuery,
    useRescoreSpeakingMutation,
    useStartPracticeSessionMutation,
    useSubmitReadingListeningMutation,
    useSubmitSpeakingMutation,
    useSubmitWritingMutation,
} from '@/features/exam-taking/hooks/useSessionQueries';
import { ReviewCopilotDrawer } from '../components/ReviewCopilotDrawer';
import { ListeningAttemptModeModal } from '../components/ListeningAttemptModeModal';
import { SpeakingSessionReview } from '../components/speaking/SpeakingSessionReview';
import { ObjectiveSessionReviewRunner } from '../components/ObjectiveSessionReviewRunner';
import { ReviewAddToFlashcard } from '../components/ReviewAddToFlashcard';
import { setListeningAttemptMode, type ListeningAttemptMode } from '../utils/listeningSession.utils';
import {
    getSessionRunnerPath,
    getSkillLabel,
    isObjectiveSkill,
    isSpeakingSkill,
    isSupportedRunnerSkill,
    isWritingSkill,
} from '../utils/sessionRouting.utils';
import { formatDateTimeToMinute } from '@/shared/lib/dateTime';
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
    getWritingTaskChartData,
    getWritingTaskFeedbackSections,
    getWritingTasks,
    parseWritingAssets,
} from '../utils/sessionReview.utils';

import { parseWritingOverallFeedback } from '../components/submit/WritingRadarChart';
import { WritingReviewSection } from '../components/submit/WritingReviewSection';
import { WritingScoringLoadingCard } from '../components/submit/WritingScoringLoadingCard';
import { WritingSummaryCard } from '../components/submit/WritingSummaryCard';
import { ObjectiveSummaryCard } from '../components/submit/ObjectiveSummaryCard';
import { SubmitHeaderToolbar } from '../components/submit/SubmitHeaderToolbar';
import { SubmitRewardAlert } from '../components/submit/SubmitRewardAlert';
import { SessionOverviewCard } from '../components/submit/SessionOverviewCard';
import { WritingCriteriaCard } from '../components/submit/WritingCriteriaCard';
import { useWritingReviewCopilot } from '../hooks/useWritingReviewCopilot';

const { Paragraph } = Typography;

const CLIENT_LAYOUT_CONTENT_GUTTER = 24;

const WRITING_SCORING_STAGES = [
    'Đang gửi bài viết đến AI để bắt đầu chấm điểm...',
    'AI đang đọc đề bài và bài viết của học viên...',
    'AI đang đánh giá bố cục, từ vựng và ngữ pháp...',
    'AI đang tổng hợp band score và feedback chi tiết...',
];

export const ClientSessionSubmitPage = () => {
    const navigate = useNavigate();
    const { sessionId = '' } = useParams();
    const [searchParams] = useSearchParams();
    const autoSubmit = searchParams.get('auto') === '1';
    const autoSubmitTriggeredRef = useRef(false);
    const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
    const [objectiveReviewLayout, setObjectiveReviewLayout] = useState({ open: false, reservedWidth: 0 });
    const [pendingListeningRestart, setPendingListeningRestart] = useState(false);
    const [writingScoringPhaseIndex, setWritingScoringPhaseIndex] = useState(0);

    const { data: session, isLoading, isError, refetch } = usePracticeSessionQuery(sessionId);
    const submitMutation = useSubmitReadingListeningMutation();
    const submitWritingMutation = useSubmitWritingMutation();
    const submitSpeakingMutation = useSubmitSpeakingMutation();
    const rescoreSpeakingMutation = useRescoreSpeakingMutation();
    const startSessionMutation = useStartPracticeSessionMutation();

    const isWritingSession = isWritingSkill(session?.skillType);
    const isSpeakingSession = isSpeakingSkill(session?.skillType);
    const showObjectiveReview = isObjectiveSkill(session?.skillType) && session?.status === 'Completed';

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

    const {
        writingCopilotOpen,
        writingCopilotLoadingContext,
        writingCopilotErrorMessage,
        writingCopilotDraftMessage,
        writingCopilotMessages,
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
    } = useWritingReviewCopilot({
        session,
        isWritingSession,
        canUseWritingCopilot,
    });

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

    useEffect(() => {
        if (!showObjectiveReview) {
            setObjectiveReviewLayout({ open: false, reservedWidth: 0 });
        }
    }, [showObjectiveReview, session?.sessionId]);

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
        if (!isWritingSession || session?.status !== 'Completed') {
            return;
        }

        submitWritingMutation.reset();
    }, [isWritingSession, session?.status, submitWritingMutation]);

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
            imageUrls: parseWritingAssets(task.assetsData).imageUrls,
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

    const activeReviewLayout = showObjectiveReview
        ? objectiveReviewLayout
        : (canUseWritingCopilot ? writingCopilotLayout : { open: false, reservedWidth: 0 });
    const reviewPanelBleedRight = activeReviewLayout.open ? CLIENT_LAYOUT_CONTENT_GUTTER : 0;
    const reservedReviewWidth = activeReviewLayout.reservedWidth > 0
        ? Math.max(activeReviewLayout.reservedWidth - reviewPanelBleedRight, 0)
        : 0;

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
            <SubmitHeaderToolbar
                headerSlot={headerSlot}
                session={session}
                showWritingScoringView={showWritingScoringView}
                canSubmitNow={canSubmitNow}
                canRetryWritingScore={canRetryWritingScore}
                activeSubmitLoading={activeSubmitLoading}
                isRestartPending={startSessionMutation.isPending}
                canUseWritingCopilot={canUseWritingCopilot}
                writingCopilotOpen={writingCopilotOpen}
                onBack={() => navigate('/app/my-exams')}
                onSubmit={handleSubmit}
                onRestart={() => {
                    if (session.skillType.trim().toUpperCase() === 'LISTENING') {
                        setPendingListeningRestart(true);
                        return;
                    }
                    handleStartNewAttempt();
                }}
                onToggleWritingCopilot={() =>
                    writingCopilotOpen ? handleCloseWritingCopilot() : openWritingCopilot(null)
                }
            />

            <div
                style={{
                    width: reviewPanelBleedRight > 0 ? `calc(100% + ${reviewPanelBleedRight}px)` : '100%',
                    marginRight: reviewPanelBleedRight > 0 ? -reviewPanelBleedRight : 0,
                    paddingRight: reservedReviewWidth,
                    transition: 'padding-right 0.22s ease',
                }}
            >
                <Space direction="vertical" size={20} style={{ width: '100%' }}>
                    <SubmitRewardAlert reward={latestReward} />

                    {showWritingScoringView ? (
                        <WritingScoringLoadingCard
                            activeSubmitLoading={activeSubmitLoading}
                            writingScoringPhaseIndex={writingScoringPhaseIndex}
                            writingScoringStages={WRITING_SCORING_STAGES}
                            submittedWritingTasks={submittedWritingTasks}
                            totalTasks={writingTasks.length}
                        />
                    ) : null}

                    {!showWritingScoringView ? (
                        <Row gutter={[16, 16]}>
                            <Col xs={24} lg={mainColLg}>
                                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                                    <SessionOverviewCard
                                        canSubmitNow={canSubmitNow}
                                        canRetryWritingScore={canRetryWritingScore}
                                        isWritingSession={isWritingSession}
                                        hasWritingScore={result?.writingScore != null}
                                        examTitle={session.examTitle}
                                        objectiveSkillLabel={objectiveSkillLabel}
                                        statusLabel={getSessionStatusLabel(session.status)}
                                        summaryInfoCards={summaryInfoCards}
                                        activeSubmitLoading={activeSubmitLoading}
                                        onBackToRunner={() => navigate(getSessionRunnerPath(session.sessionId, session.skillType))}
                                        onSubmit={handleSubmit}
                                    />

                                    {isWritingSession && !showWritingScoringView && writingFeedbacks.length > 0 ? (
                                        <WritingCriteriaCard orderedWritingFeedbacks={orderedWritingFeedbacks} />
                                    ) : null}
                                </Space>
                            </Col>

                            <Col xs={24} lg={resultColLg}>
                                <Card style={{ borderRadius: 22, height: '100%' }}>
                                    {isWritingSession ? (
                                        <WritingSummaryCard
                                            submittedWritingTasks={submittedWritingTasks}
                                            totalTasks={writingTasks.length}
                                            writingScore={result?.writingScore}
                                            writingFeedbacks={writingFeedbacks}
                                            orderedWritingFeedbacks={orderedWritingFeedbacks}
                                            writingTaskChartData={writingTaskChartData}
                                        />
                                    ) : (
                                        <ObjectiveSummaryCard
                                            objectiveSkillLabel={objectiveSkillLabel}
                                            correctQuestions={result?.correctQuestions ?? 0}
                                            totalQuestions={result?.totalQuestions ?? session.totalQuestions}
                                            objectiveBandValue={objectiveBandValue}
                                            objectiveStatCards={objectiveStatCards}
                                        />
                                    )}
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
                        <WritingReviewSection
                            writingTaskSubmissions={writingTaskSubmissions}
                            canUseWritingCopilot={canUseWritingCopilot}
                            onFocusWritingCopilotTask={handleFocusWritingCopilotTask}
                            writingFeedbacks={writingFeedbacks}
                            writingTaskFeedbackSections={writingTaskFeedbackSections}
                            writingCorrections={writingCorrections}
                        />
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
                            onRemoveFocus={(focusToRemove) =>
                                setWritingCopilotFocuses((current) =>
                                    current.filter((focus) => focus.label !== focusToRemove.label),
                                )
                            }
                            onClearSelection={() => setWritingCopilotSelectedText('')}
                            selectionChipLabel={writingCopilotSelectionChipLabel}
                            onReservedWidthChange={(nextWidth) =>
                                setWritingCopilotLayout({
                                    open: nextWidth > 0,
                                    reservedWidth: nextWidth,
                                })
                            }
                        />
                    ) : null}
                </Space>
            </div>
            <ReviewAddToFlashcard />
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

export const SessionSubmitPage = ClientSessionSubmitPage;
