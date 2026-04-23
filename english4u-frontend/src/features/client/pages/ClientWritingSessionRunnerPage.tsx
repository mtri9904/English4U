import { useEffect, useMemo, useRef, useState, type FC } from 'react';
import {
    Alert,
    Button,
    Card,
    Empty,
    Input,
    Space,
    Spin,
    Tag,
    Typography,
} from 'antd';
import {
    ArrowLeftOutlined,
    ClockCircleOutlined,
    EditOutlined,
    FileImageOutlined,
    SaveOutlined,
} from '@ant-design/icons';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import { useNavigate, useParams } from 'react-router-dom';
import { usePracticeSessionQuery, useUpdatePracticeSessionAnswersMutation } from '../api/session.api';
import { getSessionRunnerPath, getSkillLabel, isWritingSkill } from '../lib/sessionRouting';
import { extractWritingTaskImageUrls } from '@/shared/lib/writingTaskAssets';
import type { PracticeSessionDto, PracticeSessionWritingTaskDto } from '../types/session.types';

const { Title, Text } = Typography;
const WRITING_SUBMIT_MIN_WORDS = 10;

const normalizeDisplayText = (value?: string | null) =>
    (value ?? '')
        .replace(/\\r\\n/g, '\n')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\n')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');

const normalizeBlockMarkdownText = (value?: string | null) =>
    normalizeDisplayText(value)
        .replace(/\n{3,}/g, '\n\n')
        .replace(/(?<!\n)\n(?!\n)/g, '  \n')
        .trim();

const markdownComponents = {
    p: ({ children }: any) => <p style={{ margin: '0 0 12px', color: '#1e293b', lineHeight: 1.78 }}>{children}</p>,
    h1: ({ children }: any) => <h1 style={{ margin: '0 0 14px', color: '#0f172a', fontSize: 26 }}>{children}</h1>,
    h2: ({ children }: any) => <h2 style={{ margin: '0 0 12px', color: '#0f172a', fontSize: 22 }}>{children}</h2>,
    h3: ({ children }: any) => <h3 style={{ margin: '0 0 10px', color: '#0f172a', fontSize: 18 }}>{children}</h3>,
    strong: ({ children }: any) => <strong style={{ color: '#0f172a' }}>{children}</strong>,
    ul: ({ children }: any) => <ul style={{ margin: '0 0 12px 20px', padding: 0, color: '#1e293b', lineHeight: 1.75 }}>{children}</ul>,
    ol: ({ children }: any) => <ol style={{ margin: '0 0 12px 20px', padding: 0, color: '#1e293b', lineHeight: 1.75 }}>{children}</ol>,
};

const countWords = (value?: string | null) => {
    const trimmed = (value ?? '').trim();
    if (!trimmed) {
        return 0;
    }

    return trimmed.split(/\s+/).filter(Boolean).length;
};

const parseWritingAssets = (assetsData?: string | null) => {
    return extractWritingTaskImageUrls(assetsData);
};

const buildInitialWritingAnswers = (session?: PracticeSessionDto | null) => {
    if (!session) {
        return {};
    }

    return session.answers.reduce<Record<string, string>>((accumulator, answer) => {
        if (answer.writingTaskId && answer.answerText) {
            accumulator[answer.writingTaskId] = answer.answerText;
        }
        return accumulator;
    }, {});
};

const WritingTaskBody = ({
    task,
    activeTaskIndex,
    value,
    onChange,
}: {
    task: PracticeSessionWritingTaskDto;
    activeTaskIndex: number;
    value: string;
    onChange: (nextValue: string) => void;
}) => {
    const wordCount = countWords(value);
    const imageUrls = parseWritingAssets(task.assetsData);

    return (
        <Card id="runner-active-section" key={task.id} bodyStyle={{ padding: 0, overflow: 'hidden' }} style={{ borderRadius: 22 }}>
            <div className="writing-runner-split-layout">
                <div
                    className="writing-runner-split-pane"
                    style={{
                        padding: 20,
                        borderRight: '1px solid #e2e8f0',
                    }}
                >
                    <Space direction="vertical" size={16} style={{ width: '100%' }}>
                        <Space wrap>
                            <Tag color="orange" icon={<EditOutlined />}>
                                Task {task.taskNumber ?? activeTaskIndex + 1}
                            </Tag>
                        </Space>

                        <Title level={3} style={{ margin: 0, color: '#92400e' }}>
                            Writing Task {task.taskNumber ?? activeTaskIndex + 1}
                        </Title>

                        <div
                            style={{
                                border: '1px solid #fde68a',
                                borderRadius: 18,
                                padding: 18,
                                background: 'linear-gradient(135deg, #fff7ed 0%, #ffffff 100%)',
                            }}
                        >
                            {task.promptText ? (
                                <ReactMarkdown components={markdownComponents}>
                                    {normalizeBlockMarkdownText(task.promptText)}
                                </ReactMarkdown>
                            ) : (
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Task này chưa có đề bài." />
                            )}
                        </div>

                        {imageUrls.length > 0 ? (
                            <Space direction="vertical" size={12} style={{ width: '100%' }}>
                                <Space>
                                    <FileImageOutlined style={{ color: '#d97706' }} />
                                    <Text strong>Hình minh họa</Text>
                                </Space>
                                {imageUrls.map((url) => (
                                    <img
                                        key={url}
                                        src={url}
                                        alt="Writing task visual"
                                        style={{
                                            width: '100%',
                                            borderRadius: 16,
                                            border: '1px solid #e2e8f0',
                                            objectFit: 'contain',
                                        }}
                                    />
                                ))}
                            </Space>
                        ) : null}
                    </Space>
                </div>

                <div
                    className="writing-runner-split-pane"
                    style={{
                        padding: 20,
                    }}
                >
                    <Space direction="vertical" size={14} style={{ width: '100%', minHeight: '100%' }}>
                        <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
                            <div>
                                <Title level={4} style={{ margin: 0 }}>
                                    Bài viết của bạn
                                </Title>
                                <Text type="secondary">Viết trực tiếp vào khung bên dưới. Hệ thống tự lưu khi bạn nhập.</Text>
                            </div>
                            <Tag color={wordCount >= WRITING_SUBMIT_MIN_WORDS ? 'green' : 'gold'} style={{ borderRadius: 999, paddingInline: 12 }}>
                                {wordCount} từ
                            </Tag>
                        </Space>

                        <Input.TextArea
                            value={value}
                            onChange={(event) => onChange(event.target.value)}
                            placeholder="Nhập bài viết của bạn tại đây..."
                            spellCheck={false}
                            style={{
                                minHeight: 560,
                                height: 'calc(100vh - 230px)',
                                resize: 'vertical',
                                borderRadius: 18,
                                padding: 18,
                                fontSize: 16,
                                lineHeight: 1.82,
                                color: '#0f172a',
                                background: '#ffffff',
                            }}
                        />

                        <Alert
                            type="info"
                            showIcon
                            message="Chấm AI sau khi nộp"
                            description="Bấm Hoàn thành để lưu bài và chuyển sang bước submit. Hệ thống sẽ gọi Gemini để chấm Writing."
                        />
                    </Space>
                </div>
            </div>
        </Card>
    );
};

export const ClientWritingSessionPage: FC = () => {
    const navigate = useNavigate();
    const { sessionId = '' } = useParams();
    const { data: session, isLoading, isError } = usePracticeSessionQuery(sessionId);
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
        return (
            <Card style={{ borderRadius: 24, minHeight: 320, display: 'grid', placeItems: 'center' }}>
                <Spin />
            </Card>
        );
    }

    if (isError || !session) {
        return (
            <Card style={{ borderRadius: 24 }}>
                <Empty
                    description="Không tìm thấy session đang làm."
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                >
                    <Button type="primary" onClick={() => navigate('/app/my-exams')}>
                        Quay về Bài thi của tôi
                    </Button>
                </Empty>
            </Card>
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
                        description="Writing hiện chỉ lưu bài nộp, chưa chấm điểm tự động."
                    />
                    <Button type="primary" onClick={() => navigate(`/app/sessions/${sessionId}/submit`)}>
                        Xem trang nộp bài
                    </Button>
                </Space>
            </Card>
        );
    }

    const activeTask = writingTasks[activeTaskIndex];
    const timerText = timeRemaining == null
        ? 'Không giới hạn'
        : `${Math.floor(timeRemaining / 60)}:${String(timeRemaining % 60).padStart(2, '0')}`;

    return (
        <>
            {headerSlot ? createPortal(
                <div className="writing-runner-page-toolbar">
                    <Button
                        type="text"
                        className="writing-runner-back-button"
                        icon={<ArrowLeftOutlined />}
                        aria-label="Quay lại bài thi của tôi"
                        title="Bài thi của tôi"
                        onClick={() => navigate('/app/my-exams')}
                    />
                    <div className="writing-runner-title-block">
                        <span className="writing-runner-title-accent" />
                        <div className="writing-runner-page-title" title={session.examTitle}>
                            {session.examTitle}
                        </div>
                    </div>
                    <div className="writing-runner-header-meta">
                        <span className="writing-runner-header-chip writing-runner-skill-chip">{getSkillLabel(session.skillType)}</span>
                        <span className="writing-runner-header-chip">
                            <ClockCircleOutlined />
                            {timerText}
                        </span>
                        <span className="writing-runner-header-chip writing-runner-save-chip">
                            <SaveOutlined />
                            {autosaveLabel}
                        </span>
                    </div>
                    <Button
                        type="primary"
                        className="writing-runner-header-submit"
                        loading={updateAnswersMutation.isPending}
                        onClick={handleFinish}
                    >
                        Hoàn thành
                    </Button>
                </div>,
                headerSlot,
            ) : null}

            <div style={{ width: '100%', padding: '8px 8px 46px' }}>
                <style>{`
                    .writing-runner-page-toolbar {
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        width: 100%;
                        min-width: 0;
                        height: 100%;
                    }

                    .writing-runner-back-button {
                        width: 40px;
                        height: 40px;
                        flex: 0 0 40px;
                        border-radius: 12px;
                        border: 1px solid #fed7aa;
                        background: linear-gradient(135deg, #ffffff 0%, #fff7ed 100%);
                        color: #0f172a;
                        box-shadow: 0 4px 14px rgba(15, 23, 42, 0.06);
                    }

                    .writing-runner-back-button:hover {
                        border-color: #fdba74 !important;
                        background: #fff7ed !important;
                        color: #c2410c !important;
                    }

                    .writing-runner-title-block {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        min-width: 0;
                        flex: 1;
                    }

                    .writing-runner-title-accent {
                        width: 4px;
                        height: 30px;
                        flex: 0 0 4px;
                        border-radius: 999px;
                        background: linear-gradient(180deg, #d97706 0%, #f97316 100%);
                        box-shadow: 0 0 0 4px rgba(217, 119, 6, 0.1);
                    }

                    .writing-runner-page-title {
                        min-width: 0;
                        flex: 1;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                        color: #0f172a;
                        font-weight: 800;
                        font-size: 1.08rem;
                        letter-spacing: -0.02em;
                    }

                    .writing-runner-header-meta {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        flex-shrink: 0;
                    }

                    .writing-runner-header-chip {
                        display: inline-flex;
                        align-items: center;
                        gap: 6px;
                        height: 32px;
                        padding: 0 12px;
                        border-radius: 999px;
                        border: 1px solid #e2e8f0;
                        background: #ffffff;
                        color: #334155;
                        font-size: 0.84rem;
                        font-weight: 700;
                        box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
                        white-space: nowrap;
                    }

                    .writing-runner-skill-chip {
                        border-color: #fed7aa;
                        background: #fff7ed;
                        color: #c2410c;
                    }

                    .writing-runner-save-chip {
                        border-color: #bbf7d0;
                        background: #f0fdf4;
                        color: #15803d;
                    }

                    .writing-runner-header-submit {
                        flex-shrink: 0;
                        height: 32px;
                        border-radius: 999px;
                        padding-inline: 14px;
                        font-size: 0.84rem;
                        font-weight: 800;
                        box-shadow: 0 2px 8px rgba(217, 119, 6, 0.18);
                    }

                    .writing-runner-split-layout {
                        display: grid;
                        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
                        align-items: stretch;
                        height: calc(100vh - 118px);
                        min-height: 640px;
                    }

                    .writing-runner-split-pane {
                        min-width: 0;
                        height: 100%;
                        overflow-y: auto;
                        overscroll-behavior: contain;
                        padding-bottom: 18px !important;
                    }

                    .writing-runner-split-pane::-webkit-scrollbar {
                        width: 8px;
                    }

                    .writing-runner-split-pane::-webkit-scrollbar-track {
                        background: transparent;
                    }

                    .writing-runner-split-pane::-webkit-scrollbar-thumb {
                        background: rgba(148, 163, 184, 0.42);
                        border-radius: 999px;
                    }

                    @media (max-width: 1100px) {
                        .writing-runner-split-layout {
                            grid-template-columns: 1fr;
                            height: auto;
                        }

                        .writing-runner-split-pane {
                            height: auto;
                            max-height: none !important;
                            overflow: visible !important;
                            padding-bottom: 20px !important;
                        }
                    }

                    @media (max-width: 980px) {
                        .writing-runner-save-chip {
                            display: none;
                        }

                        .writing-runner-page-title {
                            font-size: 0.875rem;
                        }
                    }

                    @media (max-width: 820px) {
                        .writing-runner-header-meta {
                            gap: 6px;
                        }

                        .writing-runner-skill-chip {
                            display: none;
                        }

                        .writing-runner-header-submit {
                            padding-inline: 10px;
                        }
                    }
                `}</style>

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

                <div
                    style={{
                        position: 'fixed',
                        left: 0,
                        right: 0,
                        bottom: 0,
                        zIndex: 900,
                        padding: '4px 8px 6px',
                        background: 'linear-gradient(180deg, rgba(248,250,252,0) 0%, rgba(248,250,252,0.74) 55%, rgba(248,250,252,0.9) 100%)',
                        pointerEvents: 'none',
                    }}
                >
                    <div style={{ width: 'fit-content', margin: '0 auto', pointerEvents: 'auto' }}>
                        <Card
                            size="small"
                            bodyStyle={{ padding: 0 }}
                            style={{
                                width: 'fit-content',
                                margin: '0 auto',
                                borderRadius: 0,
                                border: '1px solid #fed7aa',
                                boxShadow: '0 6px 16px rgba(15, 23, 42, 0.1)',
                                background: 'rgba(255, 255, 255, 0.96)',
                                backdropFilter: 'blur(10px)',
                                overflow: 'hidden',
                            }}
                        >
                            <div style={{ display: 'flex' }}>
                                {writingTasks.map((task, index) => {
                                    const taskNumber = task.taskNumber ?? index + 1;
                                    const isActive = index === activeTaskIndex;

                                    return (
                                        <Button
                                            key={task.id}
                                            type="text"
                                            aria-label={`Writing Task ${taskNumber}`}
                                            onClick={() => handleTaskChange(index)}
                                            style={{
                                                borderRadius: 0,
                                                minWidth: 38,
                                                height: 32,
                                                paddingInline: 12,
                                                borderRight: index === writingTasks.length - 1 ? 'none' : '1px solid #e2e8f0',
                                                background: isActive ? '#111827' : '#fff',
                                                color: isActive ? '#fff' : '#0f172a',
                                                fontWeight: 700,
                                            }}
                                        >
                                            {taskNumber}
                                        </Button>
                                    );
                                })}
                            </div>
                        </Card>
                    </div>
                </div>
            </div>
        </>
    );
};
