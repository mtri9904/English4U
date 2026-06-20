import { useMemo, useState, type FC, type ReactNode } from 'react';
import {
    ArrowLeftOutlined,
    AudioOutlined,
    ClockCircleOutlined,
    EditOutlined,
    FileTextOutlined,
    MessageOutlined,
    PlayCircleOutlined,
    StarOutlined,
    CalendarOutlined,
    DatabaseOutlined,
    BookOutlined,
    InfoCircleOutlined,
} from '@ant-design/icons';
import {
    Button,
    Card,
    Col,
    Divider,
    Empty,
    Row,
    Skeleton,
    Space,
    Tag,
    Typography,
    message,
} from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { usePracticeExamDetailQuery } from '../api/practice.api';
import { useStartPracticeSessionMutation } from '../api/session.api';
import type { PracticeExamDetailDto, PracticeExamSectionSummaryDto } from '../types/practice.types';
import { formatDateTimeToMinute } from '@/shared/lib/dateTime';
import { getSessionRunnerPath, isSupportedRunnerSkill } from '../lib/sessionRouting';
import { ListeningAttemptModeModal } from '../components/ListeningAttemptModeModal';
import { setListeningAttemptMode, type ListeningAttemptMode } from '../lib/listeningSessionState';

const { Title, Paragraph, Text } = Typography;

const skillMeta: Record<string, { icon: ReactNode; color: string }> = {
    READING: { icon: <FileTextOutlined />, color: '#10b981' },
    LISTENING: { icon: <AudioOutlined />, color: '#3b82f6' },
    WRITING: { icon: <EditOutlined />, color: '#f59e0b' },
    SPEAKING: { icon: <MessageOutlined />, color: '#ef4444' },
};

const skillThemeMeta: Record<string, {
    color: string;
    bgGradient: string;
    lightBg: string;
    btnGradient: string;
    glowShadow: string;
}> = {
    READING: {
        color: '#10b981',
        bgGradient: 'linear-gradient(135deg, #f0fdf4 0%, #ffffff 50%, #fafafa 100%)',
        lightBg: '#f0fdf4',
        btnGradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        glowShadow: '0 8px 20px rgba(16, 185, 129, 0.25)',
    },
    LISTENING: {
        color: '#3b82f6',
        bgGradient: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 50%, #fafafa 100%)',
        lightBg: '#eff6ff',
        btnGradient: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
        glowShadow: '0 8px 20px rgba(59, 130, 246, 0.25)',
    },
    WRITING: {
        color: '#f59e0b',
        bgGradient: 'linear-gradient(135deg, #fffbeb 0%, #ffffff 50%, #fafafa 100%)',
        lightBg: '#fffbeb',
        btnGradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
        glowShadow: '0 8px 20px rgba(245, 158, 11, 0.25)',
    },
    SPEAKING: {
        color: '#ef4444',
        bgGradient: 'linear-gradient(135deg, #fef2f2 0%, #ffffff 50%, #fafafa 100%)',
        lightBg: '#fef2f2',
        btnGradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
        glowShadow: '0 8px 20px rgba(239, 68, 68, 0.25)',
    },
};

const normalizeSkill = (value?: string | null) => (value ?? '').trim().toUpperCase();

const formatSkillLabel = (value?: string | null) => {
    const normalized = normalizeSkill(value);
    if (!normalized) {
        return 'Unknown';
    }

    return normalized.charAt(0) + normalized.slice(1).toLowerCase();
};

const getPrimarySkill = (exam: PracticeExamDetailDto) => {
    const firstSkill = exam.skillTypes.find((skill) => normalizeSkill(skill).length > 0);
    if (firstSkill) return normalizeSkill(firstSkill);
    const firstSectionSkill = exam.sections.find((section) => normalizeSkill(section.skillType).length > 0)?.skillType;
    return normalizeSkill(firstSectionSkill);
};

const getPrimarySectionStats = (section?: PracticeExamSectionSummaryDto | null) => {
    if (!section) return [];

    switch (normalizeSkill(section.skillType)) {
        case 'READING':
            return [
                { label: 'Passage', value: section.readingPassageCount },
                { label: 'Nhóm câu hỏi', value: section.questionGroupCount },
                { label: 'Tổng câu', value: section.questionCount },
            ];
        case 'LISTENING':
            return [
                { label: 'Part', value: section.listeningPartCount },
                { label: 'Nhóm câu hỏi', value: section.questionGroupCount },
                { label: 'Tổng câu', value: section.questionCount },
            ];
        case 'WRITING':
            return [
                { label: 'Task', value: section.writingTaskCount },
                { label: 'Band', value: '0-9' },
                { label: 'Kỹ năng', value: 'Viết học thuật' },
            ];
        case 'SPEAKING':
            return [
                { label: 'Part', value: section.speakingPartCount },
                { label: 'Prompt', value: section.speakingQuestionCount },
                { label: 'Band', value: '0-9' },
            ];
        default:
            return [
                { label: 'Nhóm câu hỏi', value: section.questionGroupCount },
                { label: 'Tổng câu', value: section.questionCount },
            ];
    }
};

export const ClientPracticeExamPage: FC = () => {
    const navigate = useNavigate();
    const { examId = '' } = useParams();
    const { data: exam, isLoading, isError } = usePracticeExamDetailQuery(examId);
    const startSessionMutation = useStartPracticeSessionMutation();
    const [attemptModeModalOpen, setAttemptModeModalOpen] = useState(false);

    const sectionCards = useMemo(() => {
        if (!exam) {
            return [];
        }

        return [...exam.sections].sort((left, right) => (left.orderIndex ?? 0) - (right.orderIndex ?? 0));
    }, [exam]);

    const primarySection = sectionCards[0];
    const primarySkill = exam ? getPrimarySkill(exam) : '';
    const primarySkillDisplay = formatSkillLabel(primarySkill);
    const supportsPracticeRunner = isSupportedRunnerSkill(primarySkill);
    const primarySkillInfo = skillMeta[primarySkill] ?? {
        icon: <FileTextOutlined />,
        color: '#0f172a',
    };
    const currentTheme = skillThemeMeta[primarySkill] ?? skillThemeMeta['LISTENING'];
    const sectionStats = getPrimarySectionStats(primarySection);
    const isListeningExam = primarySkill === 'LISTENING';
    const isObjectiveExam = primarySkill === 'READING' || primarySkill === 'LISTENING';
    const scoreSummaryTitle = isObjectiveExam ? 'Raw score tối đa' : 'Band khi nộp';
    const scoreSummaryValue = isObjectiveExam ? (exam?.totalPoints ?? 0) : '0-9';

    const launchSession = (attemptMode?: ListeningAttemptMode) => {
        if (!supportsPracticeRunner || !exam) {
            message.info('Runner hiện tại mở cho Reading, Listening, Writing và Speaking.');
            return;
        }

        startSessionMutation.mutate(exam.id, {
            onSuccess: (result) => {
                if (isListeningExam && attemptMode) {
                    setListeningAttemptMode(result.sessionId, attemptMode);
                }
                navigate(getSessionRunnerPath(result.sessionId, result.skillType));
            },
        });
    };

    if (isLoading) {
        return (
            <Card style={{ borderRadius: 24, border: '1px solid #f1f5f9' }}>
                <Skeleton active paragraph={{ rows: 12 }} />
            </Card>
        );
    }

    if (isError || !exam) {
        return (
            <Card style={{ borderRadius: 24, border: '1px solid #f1f5f9' }}>
                <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="Không tìm thấy đề thi đã publish hoặc đề đã bị gỡ khỏi web user."
                >
                    <Button type="primary" onClick={() => navigate('/app/practice')} style={{ borderRadius: 12 }}>
                        Quay lại thư viện đề
                    </Button>
                </Empty>
            </Card>
        );
    }

    return (
        <div style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: 40 }}>
            <Card
                style={{
                    borderRadius: 24,
                    border: '1px solid rgba(226, 232, 240, 0.8)',
                    background: currentTheme.bgGradient,
                    marginBottom: 24,
                    boxShadow: '0 20px 40px -15px rgba(15, 23, 42, 0.04)',
                }}
                styles={{ body: { padding: '32px 32px 28px' } }}
            >
                <Space direction="vertical" size={24} style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                        <Button
                            type="text"
                            icon={<ArrowLeftOutlined />}
                            onClick={() => navigate('/app/practice')}
                            style={{
                                color: '#475569',
                                fontWeight: 600,
                                display: 'inline-flex',
                                alignItems: 'center',
                                paddingInline: 8,
                            }}
                        >
                            Quay lại thư viện
                        </Button>
                        <Space size={8} wrap>
                            <Tag color="purple" style={{ borderRadius: 8, paddingInline: 12, fontWeight: 600, border: 'none' }}>
                                {exam.examType || 'Practice'}
                            </Tag>
                            <Tag color={primarySkill === 'WRITING' ? 'warning' : primarySkill === 'READING' ? 'green' : primarySkill === 'SPEAKING' ? 'error' : 'blue'} style={{ borderRadius: 8, paddingInline: 12, fontWeight: 600, border: 'none' }}>
                                {primarySkillDisplay}
                            </Tag>
                            <Tag icon={<ClockCircleOutlined />} style={{ borderRadius: 8, paddingInline: 12, fontWeight: 600, background: '#f1f5f9', border: 'none', color: '#475569' }}>
                                {exam.durationMinutes ? `${exam.durationMinutes} phút` : 'Không giới hạn'}
                            </Tag>
                        </Space>
                    </div>

                    <div>
                        <Title level={2} style={{ marginBottom: 12, fontWeight: 800, color: '#0f172a' }}>
                            {exam.title}
                        </Title>
                        <Paragraph style={{ color: '#475569', maxWidth: 840, fontSize: '0.98rem', lineHeight: 1.6, marginBottom: 0 }}>
                            {exam.description || 'Đề thi này đã sẵn sàng để xem chi tiết và chuẩn bị bắt đầu làm bài. Hãy đảm bảo micro, tai nghe hoặc không gian yên tĩnh trước khi bắt đầu.'}
                        </Paragraph>
                    </div>

                    <Row gutter={[16, 16]}>
                        <Col xs={24} sm={12} md={6}>
                            <div style={{
                                background: '#ffffff',
                                border: '1px solid #f1f5f9',
                                borderRadius: 16,
                                padding: '16px 20px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 16,
                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.01)',
                                height: '100%',
                            }}>
                                <div style={{
                                    width: 44,
                                    height: 44,
                                    borderRadius: 12,
                                    display: 'grid',
                                    placeItems: 'center',
                                    background: `${currentTheme.color}12`,
                                    color: currentTheme.color,
                                    fontSize: 18,
                                    flexShrink: 0,
                                }}>
                                    {primarySkillInfo.icon}
                                </div>
                                <div style={{ minWidth: 0 }}>
                                    <span style={{ display: 'block', fontSize: 12, color: '#64748b', fontWeight: 500, marginBottom: 2 }}>Kỹ năng</span>
                                    <span style={{ fontSize: 15, color: '#0f172a', fontWeight: 700, display: 'block', truncate: true } as any}>{primarySkillDisplay}</span>
                                </div>
                            </div>
                        </Col>
                        <Col xs={24} sm={12} md={6}>
                            <div style={{
                                background: '#ffffff',
                                border: '1px solid #f1f5f9',
                                borderRadius: 16,
                                padding: '16px 20px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 16,
                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.01)',
                                height: '100%',
                            }}>
                                <div style={{
                                    width: 44,
                                    height: 44,
                                    borderRadius: 12,
                                    display: 'grid',
                                    placeItems: 'center',
                                    background: `${currentTheme.color}12`,
                                    color: currentTheme.color,
                                    fontSize: 18,
                                    flexShrink: 0,
                                }}>
                                    <StarOutlined />
                                </div>
                                <div style={{ minWidth: 0 }}>
                                    <span style={{ display: 'block', fontSize: 12, color: '#64748b', fontWeight: 500, marginBottom: 2 }}>{scoreSummaryTitle}</span>
                                    <span style={{ fontSize: 15, color: '#0f172a', fontWeight: 700, display: 'block', truncate: true } as any}>{scoreSummaryValue}</span>
                                </div>
                            </div>
                        </Col>
                        <Col xs={24} sm={12} md={6}>
                            <div style={{
                                background: '#ffffff',
                                border: '1px solid #f1f5f9',
                                borderRadius: 16,
                                padding: '16px 20px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 16,
                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.01)',
                                height: '100%',
                            }}>
                                <div style={{
                                    width: 44,
                                    height: 44,
                                    borderRadius: 12,
                                    display: 'grid',
                                    placeItems: 'center',
                                    background: `${currentTheme.color}12`,
                                    color: currentTheme.color,
                                    fontSize: 18,
                                    flexShrink: 0,
                                }}>
                                    <DatabaseOutlined />
                                </div>
                                <div style={{ minWidth: 0 }}>
                                    <span style={{ display: 'block', fontSize: 12, color: '#64748b', fontWeight: 500, marginBottom: 2 }}>{sectionStats[0]?.label || 'Đề mục'}</span>
                                    <span style={{ fontSize: 15, color: '#0f172a', fontWeight: 700, display: 'block', truncate: true } as any}>{sectionStats[0]?.value ?? '—'}</span>
                                </div>
                            </div>
                        </Col>
                        <Col xs={24} sm={12} md={6}>
                            <div style={{
                                background: '#ffffff',
                                border: '1px solid #f1f5f9',
                                borderRadius: 16,
                                padding: '16px 20px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 16,
                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.01)',
                                height: '100%',
                            }}>
                                <div style={{
                                    width: 44,
                                    height: 44,
                                    borderRadius: 12,
                                    display: 'grid',
                                    placeItems: 'center',
                                    background: `${currentTheme.color}12`,
                                    color: currentTheme.color,
                                    fontSize: 18,
                                    flexShrink: 0,
                                }}>
                                    <CalendarOutlined />
                                </div>
                                <div style={{ minWidth: 0 }}>
                                    <span style={{ display: 'block', fontSize: 12, color: '#64748b', fontWeight: 500, marginBottom: 2 }}>Cập nhật lúc</span>
                                    <span style={{ fontSize: 15, color: '#0f172a', fontWeight: 700, display: 'block', truncate: true } as any}>{formatDateTimeToMinute(exam.createdAt) || 'N/A'}</span>
                                </div>
                            </div>
                        </Col>
                    </Row>

                    <Divider style={{ margin: '8px 0' }} />

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <InfoCircleOutlined style={{ color: currentTheme.color }} />
                            <Text style={{ color: '#475569', fontSize: '0.88rem', fontWeight: 500 }}>
                                {supportsPracticeRunner
                                    ? `Đề thi ${primarySkillDisplay.toLowerCase()} đã sẵn sàng để bắt đầu làm bài.`
                                    : `Hệ thống làm bài thi ${primarySkillDisplay.toLowerCase()} đang được cập nhật.`}
                            </Text>
                        </div>
                        <Button
                            type="primary"
                            icon={<PlayCircleOutlined />}
                            disabled={!supportsPracticeRunner}
                            loading={startSessionMutation.isPending}
                            onClick={() => {
                                if (isListeningExam) {
                                    setAttemptModeModalOpen(true);
                                    return;
                                }

                                launchSession();
                            }}
                            style={{
                                height: 46,
                                paddingInline: 28,
                                borderRadius: 12,
                                fontWeight: 700,
                                fontSize: '0.95rem',
                                border: 'none',
                                background: currentTheme.btnGradient,
                                boxShadow: currentTheme.glowShadow,
                            }}
                        >
                            Bắt đầu thi
                        </Button>
                    </div>
                </Space>
            </Card>

            <Row gutter={[20, 20]}>
                <Col xs={24} lg={15}>
                    <Card
                        style={{
                            borderRadius: 24,
                            border: '1px solid #f1f5f9',
                            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)',
                            height: '100%',
                        }}
                    >
                        <Space align="center" size={14} style={{ marginBottom: 20 }}>
                            <div
                                style={{
                                    width: 46,
                                    height: 46,
                                    borderRadius: 14,
                                    display: 'grid',
                                    placeItems: 'center',
                                    background: `${primarySkillInfo.color}14`,
                                    color: primarySkillInfo.color,
                                    fontSize: 18,
                                }}
                            >
                                <BookOutlined />
                            </div>
                            <div>
                                <Text strong style={{ display: 'block', fontSize: 16, color: '#0f172a', fontWeight: 700 }}>
                                    {primarySection?.title || `${primarySkillDisplay} Section`}
                                </Text>
                                <Text type="secondary" style={{ fontSize: 13 }}>
                                    Cấu trúc đề thi chi tiết của bạn
                                </Text>
                            </div>
                        </Space>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            {sectionStats.map((item) => (
                                <div
                                    key={item.label}
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        padding: '12px 16px',
                                        background: '#f8fafc',
                                        borderRadius: 12,
                                        border: '1px solid #f1f5f9',
                                    }}
                                >
                                    <Text style={{ color: '#475569', fontWeight: 500 }}>{item.label}</Text>
                                    <Text style={{ color: '#0f172a', fontWeight: 700, fontSize: 15 }}>{item.value}</Text>
                                </div>
                            ))}
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '12px 16px',
                                    background: '#f8fafc',
                                    borderRadius: 12,
                                    border: '1px solid #f1f5f9',
                                }}
                            >
                                <Text style={{ color: '#475569', fontWeight: 500 }}>Nhóm câu hỏi</Text>
                                <Text style={{ color: '#0f172a', fontWeight: 700, fontSize: 15 }}>{primarySection?.questionGroupCount ?? 0}</Text>
                            </div>
                        </div>
                    </Card>
                </Col>
                <Col xs={24} lg={9}>
                    <Card
                        style={{
                            borderRadius: 24,
                            border: '1px solid #f1f5f9',
                            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)',
                            height: '100%',
                            background: 'linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)',
                        }}
                    >
                        <Title level={5} style={{ marginTop: 0, fontWeight: 700, color: '#0f172a', marginBottom: 16 }}>
                            Ghi chú làm bài
                        </Title>
                        <Space direction="vertical" size={14} style={{ width: '100%' }}>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <span style={{ color: currentTheme.color, fontWeight: 'bold' }}>•</span>
                                <Paragraph style={{ color: '#475569', margin: 0, fontSize: '0.88rem', lineHeight: 1.5 }}>
                                    Mỗi đề trong thư viện luyện thi được chia nhỏ theo kỹ năng giúp bạn dễ dàng tập trung nâng band điểm có chủ đích.
                                </Paragraph>
                            </div>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <span style={{ color: currentTheme.color, fontWeight: 'bold' }}>•</span>
                                <Paragraph style={{ color: '#475569', margin: 0, fontSize: '0.88rem', lineHeight: 1.5 }}>
                                    Màn hình cấu trúc bên cạnh mô tả số lượng câu, phần hoặc nhóm để bạn phân phối thời gian hợp lý khi làm bài.
                                </Paragraph>
                            </div>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <span style={{ color: currentTheme.color, fontWeight: 'bold' }}>•</span>
                                <Paragraph style={{ color: '#475569', margin: 0, fontSize: '0.88rem', lineHeight: 1.5 }}>
                                    Sau khi click Bắt đầu thi, thời gian làm bài sẽ được tính ngược. Bài làm được tự động lưu trong suốt quá trình thi.
                                </Paragraph>
                            </div>
                        </Space>
                    </Card>
                </Col>
            </Row>

            <ListeningAttemptModeModal
                open={attemptModeModalOpen}
                loading={startSessionMutation.isPending}
                onCancel={() => setAttemptModeModalOpen(false)}
                onSelectMode={(mode) => {
                    setAttemptModeModalOpen(false);
                    launchSession(mode);
                }}
            />
        </div>
    );
};
