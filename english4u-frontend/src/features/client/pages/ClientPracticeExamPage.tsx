import { useMemo, useState, type FC, type ReactNode } from 'react';
import {
    ArrowLeftOutlined,
    AudioOutlined,
    ClockCircleOutlined,
    EditOutlined,
    FileTextOutlined,
    MessageOutlined,
    PlayCircleOutlined,
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
    Statistic,
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
    READING: { icon: <FileTextOutlined />, color: '#16a34a' },
    LISTENING: { icon: <AudioOutlined />, color: '#2563eb' },
    WRITING: { icon: <EditOutlined />, color: '#d97706' },
    SPEAKING: { icon: <MessageOutlined />, color: '#dc2626' },
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
                { label: 'Điểm', value: 'Tự luận' },
                { label: 'Kỹ năng', value: 'Viết học thuật' },
            ];
        case 'SPEAKING':
            return [
                { label: 'Part', value: section.speakingPartCount },
                { label: 'Prompt', value: section.speakingQuestionCount },
                { label: 'Kỹ năng', value: 'Nói học thuật' },
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
    const sectionStats = getPrimarySectionStats(primarySection);
    const isListeningExam = primarySkill === 'LISTENING';

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
            <Card style={{ borderRadius: 20 }}>
                <Skeleton active paragraph={{ rows: 12 }} />
            </Card>
        );
    }

    if (isError || !exam) {
        return (
            <Card style={{ borderRadius: 20 }}>
                <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="Không tìm thấy đề thi đã publish hoặc đề đã bị gỡ khỏi web user."
                >
                    <Button type="primary" onClick={() => navigate('/app/practice')}>
                        Quay lại thư viện đề
                    </Button>
                </Empty>
            </Card>
        );
    }

    return (
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <Card
                style={{
                    borderRadius: 24,
                    border: '1px solid #dbeafe',
                    background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 55%, #f8fafc 100%)',
                    marginBottom: 24,
                }}
            >
                <Space direction="vertical" size={18} style={{ width: '100%' }}>
                    <Space wrap>
                        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/app/practice')}>
                            Danh sách đề
                        </Button>
                        <Tag color="purple" style={{ borderRadius: 999, paddingInline: 12 }}>
                            {exam.examType || 'Practice'}
                        </Tag>
                        <Tag color="blue" style={{ borderRadius: 999, paddingInline: 12 }}>
                            {primarySkillDisplay}
                        </Tag>
                        <Tag icon={<ClockCircleOutlined />} style={{ borderRadius: 999, paddingInline: 12 }}>
                            {exam.durationMinutes ? `${exam.durationMinutes} phút` : 'Không giới hạn'}
                        </Tag>
                    </Space>

                    <div>
                        <Title level={2} style={{ marginBottom: 8 }}>
                            {exam.title}
                        </Title>
                        <Paragraph style={{ color: '#475569', maxWidth: 820, marginBottom: 0 }}>
                            {exam.description || 'Đề thi này đã sẵn sàng để xem chi tiết và chuẩn bị bắt đầu làm bài.'}
                        </Paragraph>
                    </div>

                    <Row gutter={[16, 16]}>
                        <Col xs={12} md={6}>
                            <Statistic title="Kỹ năng" value={primarySkillDisplay} />
                        </Col>
                        <Col xs={12} md={6}>
                            <Statistic title="Điểm" value={exam.totalPoints ?? 0} />
                        </Col>
                        <Col xs={12} md={6}>
                            <Statistic title={sectionStats[0]?.label || 'Nội dung'} value={sectionStats[0]?.value ?? '—'} />
                        </Col>
                        <Col xs={12} md={6}>
                            <Statistic title="Cập nhật" value={formatDateTimeToMinute(exam.createdAt) || 'N/A'} />
                        </Col>
                    </Row>

                    <Space wrap size={12} style={{ justifyContent: 'space-between', width: '100%' }}>
                        <Text type="secondary">
                            {supportsPracticeRunner
                                ? `Đề thi ${primarySkillDisplay.toLowerCase()} đã sẵn sàng để bắt đầu session.`
                                : `De thi ${primarySkillDisplay.toLowerCase()} da publish, runner cho ky nang nay dang duoc hoan thien.`}
                        </Text>
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
                            style={{ borderRadius: 12 }}
                        >
                            Bắt đầu thi
                        </Button>
                    </Space>
                </Space>
            </Card>

            <Row gutter={[16, 16]}>
                <Col xs={24} lg={15}>
                    <Card style={{ borderRadius: 20, height: '100%' }}>
                        <Space align="center" size={12}>
                            <div
                                style={{
                                    width: 48,
                                    height: 48,
                                    borderRadius: 16,
                                    display: 'grid',
                                    placeItems: 'center',
                                    background: `${primarySkillInfo.color}14`,
                                    color: primarySkillInfo.color,
                                    fontSize: 20,
                                }}
                            >
                                {primarySkillInfo.icon}
                            </div>
                            <div>
                                <Text strong style={{ display: 'block', fontSize: 16, color: '#0f172a' }}>
                                    {primarySection?.title || `${primarySkillDisplay} Section`}
                                </Text>
                                <Text type="secondary">
                                    Cấu trúc đề thi {primarySkillDisplay.toLowerCase()}
                                </Text>
                            </div>
                        </Space>

                        <Divider />

                        <Space direction="vertical" size={12} style={{ width: '100%' }}>
                            {sectionStats.map((item) => (
                                <Row justify="space-between" key={item.label}>
                                    <Text type="secondary">{item.label}</Text>
                                    <Text strong>{item.value}</Text>
                                </Row>
                            ))}
                            <Row justify="space-between">
                                <Text type="secondary">Nhóm câu hỏi</Text>
                                <Text strong>{primarySection?.questionGroupCount ?? 0}</Text>
                            </Row>
                        </Space>
                    </Card>
                </Col>
                <Col xs={24} lg={9}>
                    <Card style={{ borderRadius: 20, height: '100%' }}>
                        <Title level={5} style={{ marginTop: 0 }}>
                            Ghi chú
                        </Title>
                        <Paragraph style={{ color: '#475569', marginBottom: 12 }}>
                            Mỗi đề trong thư viện luyện thi hiện được hiển thị theo đúng một kỹ năng để bạn lọc nhanh và tập trung đúng mục tiêu band.
                        </Paragraph>
                        <Paragraph style={{ color: '#475569', marginBottom: 0 }}>
                            Khi màn làm bài được mở, đây sẽ là nơi bạn kiểm tra cấu trúc đề trước khi bắt đầu.
                        </Paragraph>
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
