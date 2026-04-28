import { Button, Card, Col, Empty, Row, Space, Statistic, Tag, Typography, message } from 'antd';
import { useState } from 'react';
import { ClockCircleOutlined, PlayCircleOutlined, ProfileOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useMyPracticeSessionsQuery, useStartPracticeSessionMutation } from '../api/session.api';
import { getSessionRunnerPath, getSkillLabel } from '../lib/sessionRouting';
import { formatDateTimeToMinute } from '@/shared/lib/dateTime';
import { ListeningAttemptModeModal } from '../components/ListeningAttemptModeModal';
import { setListeningAttemptMode, type ListeningAttemptMode } from '../lib/listeningSessionState';

const { Title, Paragraph, Text } = Typography;

const normalizeSkill = (value?: string | null) => (value ?? '').trim().toUpperCase();

const statusColorMap: Record<string, string> = {
    NotStarted: 'default',
    InProgress: 'processing',
    Submitted: 'warning',
    Completed: 'success',
    Abandoned: 'error',
};

const formatSeconds = (value?: number | null) => {
    if (value == null) {
        return 'Khong gioi han';
    }

    const total = Math.max(0, value);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export const ClientMyExamsPage = () => {
    const navigate = useNavigate();
    const { data: sessions = [], isLoading } = useMyPracticeSessionsQuery();
    const startSessionMutation = useStartPracticeSessionMutation();
    const [pendingListeningExamId, setPendingListeningExamId] = useState<string | null>(null);

    const inProgress = sessions.filter((item) => item.status === 'InProgress').length;
    const avgScore = sessions.length > 0
        ? sessions.reduce((total, item) => total + (item.totalAutoScore ?? 0), 0) / sessions.length
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
        <Space direction="vertical" size={20} style={{ width: '100%' }}>
            <Card
                style={{
                    borderRadius: 28,
                    border: '1px solid #dbeafe',
                    background: 'radial-gradient(circle at top left, #dbeafe 0%, #eff6ff 30%, #f8fafc 65%, #ecfeff 100%)',
                }}
            >
                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                    <Tag color="blue" style={{ width: 'fit-content', borderRadius: 999, paddingInline: 12 }}>
                        Bai thi cua toi
                    </Tag>
                    <Title level={2} style={{ margin: 0 }}>
                        Resume nhanh cac luot thi dang lam
                    </Title>
                    <Paragraph style={{ margin: 0, color: '#475569', maxWidth: 860 }}>
                        Trang nay doc truc tiep tu session da tao. Ban co the mo lai Reading, Listening, Writing hoac Speaking dang lam, xem ket qua sau khi nop va kiem tra de nao dang con do.
                    </Paragraph>
                </Space>
            </Card>

            <Row gutter={[16, 16]}>
                <Col xs={12} md={8}>
                    <Card style={{ borderRadius: 20 }}>
                        <Statistic title="Tong luot thi" value={sessions.length} />
                    </Card>
                </Col>
                <Col xs={12} md={8}>
                    <Card style={{ borderRadius: 20 }}>
                        <Statistic title="Dang lam" value={inProgress} />
                    </Card>
                </Col>
                <Col xs={24} md={8}>
                    <Card style={{ borderRadius: 20 }}>
                        <Statistic title="Diem objective trung binh" value={Number.isFinite(avgScore) ? avgScore.toFixed(1) : '0.0'} />
                    </Card>
                </Col>
            </Row>

            <Row gutter={[16, 16]}>
                {sessions.length === 0 && !isLoading ? (
                    <Col span={24}>
                        <Card style={{ borderRadius: 24 }}>
                            <Empty
                                description="Bạn chưa có lượt thi nào. Hãy vào kho đề và bắt đầu một đề Reading, Listening, Writing hoặc Speaking."
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                            >
                                <Button type="primary" onClick={() => navigate('/app/practice')}>
                                    Mo kho de
                                </Button>
                            </Empty>
                        </Card>
                    </Col>
                ) : sessions.map((session) => (
                    <Col xs={24} lg={12} key={session.sessionId}>
                        {(() => {
                            const isWritingSession = normalizeSkill(session.skillType) === 'WRITING';
                            const isSpeakingSession = normalizeSkill(session.skillType) === 'SPEAKING';
                            const progressUnit = isWritingSession ? 'task' : isSpeakingSession ? 'prompt' : 'câu';
                            const scoreLabel = isWritingSession
                                ? (session.writingScore != null ? session.writingScore.toFixed(1) : '—')
                                : isSpeakingSession
                                    ? (session.speakingScore != null ? session.speakingScore.toFixed(1) : '—')
                                : (session.totalAutoScore != null ? session.totalAutoScore.toFixed(1) : '0.0');

                            return (
                        <Card
                            loading={isLoading}
                            style={{
                                borderRadius: 24,
                                border: '1px solid #e2e8f0',
                                height: '100%',
                            }}
                        >
                            <Space direction="vertical" size={14} style={{ width: '100%' }}>
                                <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
                                    <Space wrap>
                                        <Tag color="blue">{getSkillLabel(session.skillType)}</Tag>
                                        <Tag color={statusColorMap[session.status] || 'default'}>{session.status}</Tag>
                                        <Tag icon={<ClockCircleOutlined />}>{formatSeconds(session.timeRemaining)}</Tag>
                                    </Space>
                                    <Text type="secondary">{formatDateTimeToMinute(session.startedAt) || 'N/A'}</Text>
                                </Space>

                                <div>
                                    <Title level={4} style={{ margin: 0 }}>
                                        {session.examTitle}
                                    </Title>
                                    <Paragraph style={{ margin: '10px 0 0', color: '#64748b' }}>
                                        {session.answeredQuestions}/{session.totalQuestions} {progressUnit} đã có đáp án.
                                        {session.resumeQuestionNumber ? ` Resume tu Q${session.resumeQuestionNumber}.` : ''}
                                    </Paragraph>
                                </div>

                                <Row gutter={[12, 12]}>
                                    <Col span={8}>
                                        <Statistic title="Da lam" value={`${session.answeredQuestions}/${session.totalQuestions}`} />
                                    </Col>
                                    <Col span={8}>
                                        <Statistic title={isWritingSession || isSpeakingSession ? 'Band' : 'Diem'} value={scoreLabel} />
                                    </Col>
                                    <Col span={8}>
                                        <Statistic title="Loai de" value={session.examType || 'Practice'} />
                                    </Col>
                                </Row>

                                <Space wrap>
                                    {session.status === 'InProgress' ? (
                                        <Button
                                            type="primary"
                                            icon={<PlayCircleOutlined />}
                                            onClick={() => navigate(getSessionRunnerPath(session.sessionId, session.skillType))}
                                        >
                                            Tiep tuc lam bai
                                        </Button>
                                    ) : (
                                        <Button
                                            icon={<ProfileOutlined />}
                                            onClick={() => navigate(`/app/sessions/${session.sessionId}/submit`)}
                                        >
                                            Xem ket qua
                                        </Button>
                                    )}
                                    <Button onClick={() => navigate(`/app/practice/${session.examId}`)}>
                                        Xem de goc
                                    </Button>
                                    {session.status !== 'InProgress' ? (
                                        <Button
                                            icon={<ReloadOutlined />}
                                            loading={startSessionMutation.isPending}
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
