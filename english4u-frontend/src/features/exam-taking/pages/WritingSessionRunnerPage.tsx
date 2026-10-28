import { useEffect, useMemo, useRef, useState, type FC } from 'react';
import { Alert, Button, Card, Empty, Space } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { PageLoadingState, PageErrorState } from '@/components';
import {
    usePracticeSessionQuery,
    useUpdatePracticeSessionAnswersMutation,
} from '@/features/exam-taking/hooks/useSessionQueries';
import { getSessionRunnerPath, isWritingSkill } from '../utils/sessionRouting.utils';
import { writingRunnerStyles } from '../components/writing/writingRunner.styles';
import { buildInitialWritingAnswers } from '../components/writing/writingRunner.utils';
import { WritingTaskBody } from '../components/writing/WritingTaskBody';
import { WritingRunnerHeaderToolbar } from '../components/writing/WritingRunnerHeaderToolbar';
import { WritingTaskSwitcherBar } from '../components/writing/WritingTaskSwitcherBar';

export const ClientWritingSessionPage: FC = () => {
    const navigate = useNavigate();
    const { sessionId = '' } = useParams();
    const { data: session, isLoading, isError, refetch } = usePracticeSessionQuery(sessionId);
    const updateAnswersMutation = useUpdatePracticeSessionAnswersMutation();

    const [answerMap, setAnswerMap] = useState<Record<string, string>>({});
    const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
    const [autosaveLabel, setAutosaveLabel] = useState('Chưa lưu');
    const [activeTaskIndex, setActiveTaskIndex] = useState(0);
    const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
    const dirtyAnswersRef = useRef<Record<string, string>>({});
    const timerValueRef = useRef<number | null>(null);
    const lastPersistedTimeRef = useRef<number | null>(null);
    const hasRedirectedOnTimeoutRef = useRef(false);

    useEffect(() => {
        if (!session) {
            return;
        }

        setAnswerMap(buildInitialWritingAnswers(session));
        setTimeRemaining(session.timeRemaining ?? null);
        timerValueRef.current = session.timeRemaining ?? null;
        lastPersistedTimeRef.current = session.timeRemaining ?? null;
        setAutosaveLabel('Đã đồng bộ với server');
    }, [session?.sessionId]);

    useEffect(() => {
        setHeaderSlot(document.getElementById('client-page-header-slot'));
    }, []);

    useEffect(() => {
        timerValueRef.current = timeRemaining;
    }, [timeRemaining]);

    const writingTasks = useMemo(() => {
        if (!session) {
            return [];
        }

        return session.exam.sections
            .filter((section) => section.skillType.trim().toUpperCase() === 'WRITING')
            .flatMap((section) => section.writingTasks)
            .sort((left, right) => (left.taskNumber ?? 0) - (right.taskNumber ?? 0));
    }, [session]);

    useEffect(() => {
        setActiveTaskIndex((current) => {
            if (writingTasks.length === 0) {
                return 0;
            }

            return Math.min(current, writingTasks.length - 1);
        });
    }, [writingTasks.length]);

    const flushAnswers = (includeTimerOnly = false) => {
        if (!sessionId) {
            return;
        }

        const dirtyAnswers = Object.entries(dirtyAnswersRef.current).map(([writingTaskId, answerText]) => ({
            writingTaskId,
            answerText: answerText || null,
        }));

        const nextTimeRemaining = timerValueRef.current;
        const shouldPersistTimer = nextTimeRemaining !== lastPersistedTimeRef.current;

        if (!includeTimerOnly && dirtyAnswers.length === 0 && !shouldPersistTimer) {
            return;
        }

        if (includeTimerOnly && !shouldPersistTimer) {
            return;
        }

        const payload = {
            sessionId,
            data: {
                timeRemaining: nextTimeRemaining,
                answers: includeTimerOnly ? [] : dirtyAnswers,
            },
        };

        if (!includeTimerOnly) {
            dirtyAnswersRef.current = {};
        }

        lastPersistedTimeRef.current = nextTimeRemaining;
        setAutosaveLabel('Đang lưu...');
        updateAnswersMutation.mutate(payload, {
            onSuccess: () => {
                setAutosaveLabel('Đã lưu tự động');
            },
            onError: () => {
                setAutosaveLabel('Lưu tạm thất bại');
            },
        });
    };

    useEffect(() => {
        const timeout = window.setInterval(() => {
            flushAnswers(true);
        }, 15000);

        return () => window.clearInterval(timeout);
    }, [sessionId]);

    useEffect(() => {
        if (!session || session.status !== 'InProgress' || timeRemaining == null) {
            return;
        }

        const interval = window.setInterval(() => {
            setTimeRemaining((current) => {
                if (current == null) {
                    return current;
                }

                const nextValue = Math.max(0, current - 1);
                if (nextValue === 0 && !hasRedirectedOnTimeoutRef.current) {
                    hasRedirectedOnTimeoutRef.current = true;
                    flushAnswers();
                    navigate(`/app/sessions/${sessionId}/submit?auto=1`, { replace: true });
                }
                return nextValue;
            });
        }, 1000);

        return () => window.clearInterval(interval);
    }, [session?.status, timeRemaining, navigate, sessionId]);

    useEffect(() => () => {
        flushAnswers();
    }, []);

    useEffect(() => {
        if (Object.keys(dirtyAnswersRef.current).length === 0) {
            return;
        }

        const timeout = window.setTimeout(() => {
            flushAnswers();
        }, 900);

        return () => window.clearTimeout(timeout);
    }, [answerMap]);

    const handleAnswerChange = (writingTaskId: string, nextValue: string) => {
        setAnswerMap((current) => ({ ...current, [writingTaskId]: nextValue }));
        dirtyAnswersRef.current = { ...dirtyAnswersRef.current, [writingTaskId]: nextValue };
        setAutosaveLabel('Chưa lưu');
    };

    const handleTaskChange = (index: number) => {
        setActiveTaskIndex(index);
        window.requestAnimationFrame(() => {
            document.getElementById('runner-active-section')?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
            });
        });
    };

    const handleFinish = async () => {
        if (!sessionId) {
            return;
        }

        setAutosaveLabel('Đang lưu...');
        try {
            await updateAnswersMutation.mutateAsync({
                sessionId,
                data: {
                    timeRemaining: timerValueRef.current,
                    answers: writingTasks.map((task) => ({
                        writingTaskId: task.id,
                        answerText: answerMap[task.id] || null,
                    })),
                },
            });
            dirtyAnswersRef.current = {};
            lastPersistedTimeRef.current = timerValueRef.current;
            setAutosaveLabel('Đã lưu tự động');
        } catch {
            setAutosaveLabel('Lưu tạm thất bại');
        }

        navigate(`/app/sessions/${sessionId}/submit?auto=1`);
    };

    if (isLoading) {
        return <PageLoadingState type="spin" tip="Đang tải phiên thi Writing..." />;
    }

    if (isError || !session) {
        return (
            <div style={{ maxWidth: 640, margin: '60px auto' }}>
                <PageErrorState
                    title="Không tìm thấy phiên thi Writing"
                    onRetry={() => refetch()}
                    backUrl="/app/my-exams"
                    backText="Quay về Bài thi của tôi"
                />
            </div>
        );
    }

    if (!isWritingSkill(session.skillType)) {
        navigate(getSessionRunnerPath(session.sessionId, session.skillType), { replace: true });
        return null;
    }

    if (session.status !== 'InProgress') {
        return (
            <Card style={{ borderRadius: 24 }}>
                <Space direction="vertical" size={16}>
                    <Alert
                        type="success"
                        showIcon
                        message="Session này đã được nộp."
                        description="Bạn có thể mở trang kết quả để xem điểm Writing và feedback AI."
                    />
                    <Button type="primary" onClick={() => navigate(`/app/sessions/${sessionId}/submit`)}>
                        Xem trang nộp bài
                    </Button>
                </Space>
            </Card>
        );
    }

    const activeTask = writingTasks[activeTaskIndex];
    const timerText =
        timeRemaining == null
            ? 'Không giới hạn'
            : `${Math.floor(timeRemaining / 60)}:${String(timeRemaining % 60).padStart(2, '0')}`;

    return (
        <>
            <WritingRunnerHeaderToolbar
                headerSlot={headerSlot}
                examTitle={session.examTitle}
                skillType={session.skillType}
                timerText={timerText}
                autosaveLabel={autosaveLabel}
                isPending={updateAnswersMutation.isPending}
                onBack={() => navigate('/app/my-exams')}
                onFinish={handleFinish}
            />

            <div style={{ width: '100%', padding: '8px 8px 46px' }}>
                <style>{writingRunnerStyles}</style>

                {activeTask ? (
                    <WritingTaskBody
                        task={activeTask}
                        activeTaskIndex={activeTaskIndex}
                        value={answerMap[activeTask.id] ?? ''}
                        onChange={(nextValue) => handleAnswerChange(activeTask.id, nextValue)}
                    />
                ) : (
                    <Card style={{ borderRadius: 22 }}>
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Đề này chưa có Writing Task." />
                    </Card>
                )}

                <WritingTaskSwitcherBar
                    writingTasks={writingTasks}
                    activeTaskIndex={activeTaskIndex}
                    onTaskChange={handleTaskChange}
                />
            </div>
        </>
    );
};

export const WritingSessionPage = ClientWritingSessionPage;
