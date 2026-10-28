import { Button, Card, Col, Empty, Pagination, Progress, Row, Segmented, Space, Statistic, Tag, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import {
    BookOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    FieldTimeOutlined,
    PlayCircleOutlined,
    ProfileOutlined,
    ReloadOutlined,
    TrophyOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { PageLoadingState, PageErrorState } from '@/components';
import { useMyPracticeSessionsQuery, useStartPracticeSessionMutation } from '@/features/exam-taking';
import { getSessionRunnerPath, getSkillLabel } from '@/features/exam-taking';
import { formatDateTimeToMinute } from '@/shared/lib/dateTime';
import { ListeningAttemptModeModal } from '@/features/exam-taking';
import { setListeningAttemptMode, type ListeningAttemptMode } from '@/features/exam-taking';

const { Title, Paragraph, Text } = Typography;
import {
    EXAM_SESSION_STATUS_COLOR_MAP as statusColorMap,
    EXAM_SESSION_STATUS_LABEL_MAP as statusLabelMap,
    EXAM_SKILL_FILTER_OPTIONS as skillFilterOptions,
    EXAM_STATUS_FILTER_OPTIONS as statusFilterOptions,
} from '../constants/exam.constants';
import {
    normalizeSkillToken as normalizeSkill,
    getSessionBandScore,
    getMyExamsSkillTheme as getSkillTheme,
} from '../utils/exam.utils';



const libraryButtonStyle = {
    border: 'none',
    fontWeight: 800,
    color: '#ffffff',
    background: 'linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)',
    boxShadow: '0 10px 22px rgba(37, 99, 235, 0.24)',
};

const continueButtonStyle = {
    border: 'none',
    fontWeight: 800,
    color: '#ffffff',
    background: 'linear-gradient(135deg, #059669 0%, #0ea5e9 100%)',
    boxShadow: '0 8px 18px rgba(5, 150, 105, 0.22)',
};

const resultButtonStyle = {
    border: 'none',
    fontWeight: 700,
    color: '#ffffff',
    background: 'linear-gradient(135deg, #16a34a 0%, #22c55e 100%)',
    boxShadow: '0 8px 18px rgba(22, 163, 74, 0.18)',
};

const sourceButtonStyle = {
    fontWeight: 700,
    color: '#4338ca',
    background: '#eef2ff',
    borderColor: '#c7d2fe',
};

const retryButtonStyle = {
    border: 'none',
    fontWeight: 800,
    color: '#78350f',
    background: 'linear-gradient(135deg, #fef3c7 0%, #facc15 100%)',
    boxShadow: '0 8px 18px rgba(234, 179, 8, 0.2)',
};

const clearFilterButtonStyle = {
    fontWeight: 700,
    color: '#0f172a',
    background: '#f1f5f9',
    borderColor: '#cbd5e1',
};

const statsCardConfigs = [
    {
        title: 'Tổng bài đã luyện',
        icon: <BookOutlined />,
        accent: '#2563eb',
        background: 'linear-gradient(180deg, #eff6ff 0%, #ffffff 100%)',
        border: '#bfdbfe',
    },
    {
        title: 'Đang làm',
        icon: <FieldTimeOutlined />,
        accent: '#0f766e',
        background: 'linear-gradient(180deg, #ecfeff 0%, #ffffff 100%)',
        border: '#99f6e4',
    },
    {
        title: 'Đã có kết quả',
        icon: <CheckCircleOutlined />,
        accent: '#16a34a',
        background: 'linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%)',
        border: '#bbf7d0',
    },
    {
        title: 'Điểm trung bình',
        icon: <TrophyOutlined />,
        accent: '#d97706',
        background: 'linear-gradient(180deg, #fffbeb 0%, #ffffff 100%)',
        border: '#fde68a',
    },
] as const;

const formatSeconds = (value?: number | null) => {
    if (value == null) {
        return 'Không giới hạn';
    }

    const total = Math.max(0, value);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export const ClientMyExamsPage = () => {
    const navigate = useNavigate();
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 8;
    const [pendingListeningExamId, setPendingListeningExamId] = useState<string | null>(null);
    const [selectedSkill, setSelectedSkill] = useState('ALL');
    const [selectedStatus, setSelectedStatus] = useState('ALL');

    useEffect(() => {
        setCurrentPage(1);
    }, [selectedSkill, selectedStatus]);

    const { data: pagedData, isLoading, isError, refetch } = useMyPracticeSessionsQuery({
        skill: selectedSkill !== 'ALL' ? selectedSkill : undefined,
        status: selectedStatus !== 'ALL' ? selectedStatus : undefined,
        pageNumber: currentPage,
        pageSize,
    });
    const startSessionMutation = useStartPracticeSessionMutation();
    const rawSessions = pagedData?.items ?? [];
    const totalCount = pagedData?.totalCount ?? 0;
    const visibleSessions = rawSessions;

    const inProgress = visibleSessions.filter((item) => item.status === 'InProgress').length;
    const completed = visibleSessions.filter((item) => item.status === 'Completed' || item.status === 'Submitted').length;
    const scoredSessions = visibleSessions
        .map(getSessionBandScore)
        .filter((score): score is number => score != null);
    const avgScore = scoredSessions.length > 0
        ? scoredSessions.reduce((total, score) => total + score, 0) / scoredSessions.length
        : 0;

    const handleStartNewAttempt = (examId: string, attemptMode?: ListeningAttemptMode) => {
        startSessionMutation.mutate(
            { examId, forceNew: true },
            {
                onSuccess: (result) => {
                    if (attemptMode) {
                        setListeningAttemptMode(result.sessionId, attemptMode);
                    }
                    message.success('Đã tạo lượt làm bài mới.');
                    navigate(getSessionRunnerPath(result.sessionId, result.skillType));
                },
            },
        );
    };

    return (
        <Space direction="vertical" size={18} style={{ width: '100%' }}>
            <Card
                style={{
                    borderRadius: 18,
                    border: '1px solid #dbeafe',
                    background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 58%, #eff6ff 100%)',
                    boxShadow: '0 16px 40px rgba(15, 23, 42, 0.08)',
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap' }}>
                    <Space direction="vertical" size={8} style={{ maxWidth: 760 }}>
                        <Tag color="blue" style={{ width: 'fit-content', borderRadius: 999, paddingInline: 12, margin: 0 }}>
                            Bài thi của tôi
                        </Tag>
                        <Title level={2} style={{ margin: 0, color: '#0f172a', letterSpacing: 0 }}>
                            Tiếp tục luyện thi từ đúng nơi bạn dừng lại
                        </Title>
                        <Paragraph style={{ margin: 0, color: '#475569', fontSize: 15 }}>
                            Theo dõi lượt làm bài, kết quả đã chấm và mở lại nhanh Reading, Listening, Writing hoặc Speaking.
                        </Paragraph>
                    </Space>
                    <Button type="primary" size="large" icon={<BookOutlined />} style={libraryButtonStyle} onClick={() => navigate('/app/practice')}>
                        Kho đề luyện tập
                    </Button>
                </div>
            </Card>

            <Row gutter={[16, 16]}>
                {statsCardConfigs.map((item) => (
                    <Col xs={12} md={6} key={item.title}>
                        <Card
                            loading={isLoading}
                            style={{
                                borderRadius: 18,
                                border: `1px solid ${item.border}`,
                                background: item.background,
                                boxShadow: '0 12px 28px rgba(15, 23, 42, 0.06)',
                                overflow: 'hidden',
                                position: 'relative',
                            }}
                            styles={{ body: { padding: 18 } }}
                        >
                            <div
                                style={{
                                    position: 'absolute',
                                    inset: '0 auto 0 0',
                                    width: 5,
                                    background: item.accent,
                                }}
                            />
                            <Statistic
                                title={<span style={{ color: '#64748b', fontSize: 14 }}>{item.title}</span>}
                                value={item.title === 'Tổng bài đã luyện'
                                    ? totalCount
                                    : item.title === 'Đang làm'
                                        ? inProgress
                                        : item.title === 'Đã có kết quả'
                                            ? completed
                                            : Number.isFinite(avgScore)
                                                ? avgScore.toFixed(1)
                                                : '0.0'}
                                prefix={<span style={{ color: item.accent }}>{item.icon}</span>}
                                valueStyle={{ color: '#0f172a', fontWeight: 800 }}
                            />
                        </Card>
                    </Col>
                ))}
            </Row>

            <Card
                style={{
                    borderRadius: 18,
                    border: '1px solid #dbeafe',
                    background: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)',
                    boxShadow: '0 12px 28px rgba(15, 23, 42, 0.05)',
                }}
                styles={{ body: { padding: 16 } }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Space direction="vertical" size={4}>
                        <Text strong style={{ color: '#0f172a' }}>Bộ lọc bài thi</Text>
                        <Text type="secondary" style={{ fontSize: 13 }}>Tổng số {totalCount} bài thi</Text>
                    </Space>
                    <Space size={10} wrap>
                        <Segmented options={skillFilterOptions} value={selectedSkill} onChange={(value) => setSelectedSkill(String(value))} />
                        <Segmented options={statusFilterOptions} value={selectedStatus} onChange={(value) => setSelectedStatus(String(value))} />
                    </Space>
                </div>
            </Card>

            <Row gutter={[16, 16]}>
                {isLoading ? (
                    <Col span={24}>
                        <PageLoadingState type="cards" cardCount={4} />
                    </Col>
                ) : isError ? (
                    <Col span={24}>
                        <PageErrorState
                            title="Không thể tải lịch sử bài thi"
                            onRetry={() => refetch()}
                        />
                    </Col>
                ) : visibleSessions.length === 0 ? (
                    <Col span={24}>
                        <Card style={{ borderRadius: 18, border: '1px solid #e2e8f0' }}>
                            {selectedSkill === 'ALL' && selectedStatus === 'ALL' ? (
                                <Empty
                                    description="Bạn chưa làm bài thi nào. Hãy vào kho đề và bắt đầu một đề Reading, Listening, Writing hoặc Speaking."
                                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                                >
                                    <Button type="primary" style={libraryButtonStyle} onClick={() => navigate('/app/practice')}>
                                        Mở kho đề
                                    </Button>
                                </Empty>
                            ) : (
                                <Empty description="Không có bài thi nào khớp bộ lọc hiện tại." image={Empty.PRESENTED_IMAGE_SIMPLE}>
                                    <Button style={clearFilterButtonStyle} onClick={() => { setSelectedSkill('ALL'); setSelectedStatus('ALL'); }}>
                                        Xóa bộ lọc
                                    </Button>
                                </Empty>
                            )}
                        </Card>
                    </Col>
                ) : visibleSessions.map((session) => (
                    <Col xs={24} lg={12} key={session.sessionId}>
                        {(() => {
                            const isWritingSession = normalizeSkill(session.skillType) === 'WRITING';
                            const isSpeakingSession = normalizeSkill(session.skillType) === 'SPEAKING';
                            const progressUnit = isWritingSession ? 'task' : isSpeakingSession ? 'prompt' : 'câu';
                            const progressPercent = session.totalQuestions > 0
                                ? Math.round((session.answeredQuestions / session.totalQuestions) * 100)
                                : 0;
                            const scoreLabel = isWritingSession
                                ? (session.writingScore != null ? session.writingScore.toFixed(1) : '—')
                                : isSpeakingSession
                                    ? (session.speakingScore != null ? session.speakingScore.toFixed(1) : '—')
                                    : (session.totalBandScore != null ? session.totalBandScore.toFixed(1) : '—');
                            const skillTheme = getSkillTheme(session.skillType);

                            return (
                        <Card
                            loading={isLoading}
                            style={{
                                borderRadius: 18,
                                border: `1px solid ${skillTheme.border}`,
                                background: `linear-gradient(180deg, ${skillTheme.bg} 0%, #ffffff 22%)`,
                                height: '100%',
                                boxShadow: '0 14px 32px rgba(15, 23, 42, 0.08)',
                                overflow: 'hidden',
                                position: 'relative',
                            }}
                            styles={{ body: { padding: 20 } }}
                        >
                            <div
                                style={{
                                    position: 'absolute',
                                    inset: '0 auto 0 0',
                                    width: 5,
                                    background: skillTheme.color,
                                }}
                            />
                            <Space direction="vertical" size={16} style={{ width: '100%' }}>
                                <Space wrap style={{ justifyContent: 'space-between', width: '100%', alignItems: 'flex-start' }}>
                                    <Space wrap size={6}>
                                        <Tag style={{ margin: 0, color: skillTheme.color, background: skillTheme.bg, borderColor: skillTheme.border, fontWeight: 700 }}>
                                            {getSkillLabel(session.skillType)}
                                        </Tag>
                                        <Tag color={statusColorMap[session.status] || 'default'} style={{ margin: 0 }}>
                                            {statusLabelMap[session.status] || session.status}
                                        </Tag>
                                        <Tag icon={<ClockCircleOutlined />} style={{ margin: 0 }}>
                                            {formatSeconds(session.timeRemaining)}
                                        </Tag>
                                        {session.attemptCount && session.attemptCount > 1 ? (
                                            <Tag color="cyan" style={{ margin: 0, fontWeight: 700 }}>
                                                {session.attemptCount} lượt làm
                                            </Tag>
                                        ) : null}
                                    </Space>
                                    <Text type="secondary" style={{ fontSize: 13 }}>
                                        {session.attemptCount && session.attemptCount > 1 ? 'Mới nhất: ' : ''}
                                        {formatDateTimeToMinute(session.startedAt) || 'N/A'}
                                    </Text>
                                </Space>

                                <div>
                                    <Title level={4} style={{ margin: 0, color: '#0f172a', letterSpacing: 0 }}>
                                        {session.examTitle}
                                    </Title>
                                    <Paragraph style={{ margin: '8px 0 0', color: '#64748b' }}>
                                        {session.answeredQuestions}/{session.totalQuestions} {progressUnit} đã có đáp án.
                                        {session.resumeQuestionNumber ? ` Tiếp tục từ Q${session.resumeQuestionNumber}.` : ''}
                                    </Paragraph>
                                </div>

                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                        <Text type="secondary" style={{ fontSize: 13 }}>Tiến độ</Text>
                                        <Text strong style={{ fontSize: 13 }}>{progressPercent}%</Text>
                                    </div>
                                    <Progress percent={progressPercent} showInfo={false} strokeColor={skillTheme.color} trailColor="#f1f5f9" />
                                </div>

                                <Row gutter={[10, 10]}>
                                    <Col span={8}>
                                        <div style={{ padding: '10px 12px', borderRadius: 12, background: '#ffffff', border: `1px solid ${skillTheme.border}`, boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.7)' }}>
                                            <Text type="secondary" style={{ fontSize: 12 }}>Đã làm</Text>
                                            <div style={{ fontWeight: 800, color: '#0f172a', marginTop: 2 }}>{session.answeredQuestions}/{session.totalQuestions}</div>
                                        </div>
                                    </Col>
                                    <Col span={8}>
                                        <div style={{ padding: '10px 12px', borderRadius: 12, background: '#ffffff', border: `1px solid ${skillTheme.border}`, boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.7)' }}>
                                            <Text type="secondary" style={{ fontSize: 12 }}>Điểm</Text>
                                            <div style={{ fontWeight: 800, color: '#0f172a', marginTop: 2 }}>{scoreLabel}</div>
                                        </div>
                                    </Col>
                                    <Col span={8}>
                                        <div style={{ padding: '10px 12px', borderRadius: 12, background: '#ffffff', border: `1px solid ${skillTheme.border}`, boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.7)' }}>
                                            <Text type="secondary" style={{ fontSize: 12 }}>Loại đề</Text>
                                            <div style={{ fontWeight: 800, color: '#0f172a', marginTop: 2 }}>{session.examType || 'Practice'}</div>
                                        </div>
                                    </Col>
                                </Row>

                                <Space wrap>
                                    {session.status === 'InProgress' ? (
                                        <Button
                                            type="primary"
                                            icon={<PlayCircleOutlined />}
                                            style={continueButtonStyle}
                                            onClick={() => navigate(getSessionRunnerPath(session.sessionId, session.skillType))}
                                        >
                                            Tiếp tục làm bài
                                        </Button>
                                    ) : (
                                        <Button
                                            icon={<ProfileOutlined />}
                                            style={resultButtonStyle}
                                            onClick={() => navigate(`/app/sessions/${session.sessionId}/submit`)}
                                        >
                                            Xem kết quả
                                        </Button>
                                    )}
                                    <Button style={sourceButtonStyle} onClick={() => navigate(`/app/practice/${session.examId}`)}>
                                        Xem đề gốc
                                    </Button>
                                    {session.status !== 'InProgress' ? (
                                        <Button
                                            icon={<ReloadOutlined />}
                                            loading={startSessionMutation.isPending}
                                            style={retryButtonStyle}
                                            onClick={() => {
                                                if (normalizeSkill(session.skillType) === 'LISTENING') {
                                                    setPendingListeningExamId(session.examId);
                                                    return;
                                                }

                                                handleStartNewAttempt(session.examId);
                                            }}
                                        >
                                            Làm lại bài mới
                                        </Button>
                                    ) : null}
                                </Space>
                            </Space>
                        </Card>
                            );
                        })()}
                    </Col>
                ))}
            </Row>

            {totalCount > pageSize && (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
                    <Pagination
                        current={currentPage}
                        pageSize={pageSize}
                        total={totalCount}
                        onChange={(page) => setCurrentPage(page)}
                        showSizeChanger={false}
                    />
                </div>
            )}

            <ListeningAttemptModeModal
                open={!!pendingListeningExamId}
                loading={startSessionMutation.isPending}
                onCancel={() => setPendingListeningExamId(null)}
                onSelectMode={(mode) => {
                    if (!pendingListeningExamId) {
                        return;
                    }

                    const examId = pendingListeningExamId;
                    setPendingListeningExamId(null);
                    handleStartNewAttempt(examId, mode);
                }}
            />
        </Space>
    );
};

export const MyExamsPage = ClientMyExamsPage;
