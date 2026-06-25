import { useMemo, useState, useEffect, type FC, type ReactNode } from 'react';
import {
    Button,
    Card,
    Col,
    Empty,
    Input,
    Pagination,
    Row,
    Select,
    Skeleton,
    Space,
    Tag,
    Typography,
} from 'antd';
import {
    AppstoreOutlined,
    AudioOutlined,
    ClockCircleOutlined,
    EditOutlined,
    FileSearchOutlined,
    FileTextOutlined,
    MessageOutlined,
    RightOutlined,
    SearchOutlined,
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { usePracticeExamsQuery } from '../api/practice.api';
import { useMyPracticeSessionsQuery } from '../api/session.api';
import type { PracticeExamListItemDto } from '../types/practice.types';
import { formatDateTimeToMinute } from '@/shared/lib/dateTime';

const { Title, Paragraph, Text } = Typography;

interface SkillTheme {
    color: string;
    soft: string;
    border: string;
    accent: string;
    gradient: string;
    shadow: string;
    icon: ReactNode;
}

const skillThemeMap: Record<string, SkillTheme> = {
    READING: {
        color: '#047857',
        soft: 'linear-gradient(135deg, rgba(236, 253, 245, 0.7) 0%, rgba(209, 250, 229, 0.5) 100%)',
        border: 'rgba(167, 243, 208, 0.5)',
        accent: '#059669',
        gradient: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
        shadow: 'rgba(16, 185, 129, 0.15)',
        icon: <FileTextOutlined />,
    },
    LISTENING: {
        color: '#1d4ed8',
        soft: 'linear-gradient(135deg, rgba(239, 246, 255, 0.7) 0%, rgba(219, 234, 254, 0.5) 100%)',
        border: 'rgba(191, 219, 254, 0.5)',
        accent: '#2563eb',
        gradient: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
        shadow: 'rgba(59, 130, 246, 0.15)',
        icon: <AudioOutlined />,
    },
    WRITING: {
        color: '#b45309',
        soft: 'linear-gradient(135deg, rgba(255, 251, 235, 0.7) 0%, rgba(254, 243, 199, 0.5) 100%)',
        border: 'rgba(253, 230, 138, 0.5)',
        accent: '#d97706',
        gradient: 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)',
        shadow: 'rgba(245, 158, 11, 0.15)',
        icon: <EditOutlined />,
    },
    SPEAKING: {
        color: '#b91c1c',
        soft: 'linear-gradient(135deg, rgba(254, 242, 242, 0.7) 0%, rgba(254, 226, 226, 0.5) 100%)',
        border: 'rgba(254, 202, 202, 0.5)',
        accent: '#dc2626',
        gradient: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
        shadow: 'rgba(239, 68, 68, 0.15)',
        icon: <MessageOutlined />,
    },
};

const normalizeToken = (value?: string | null) => (value ?? '').trim().toUpperCase();

const formatSkillLabel = (skill: string) => {
    const normalized = normalizeToken(skill);
    if (!normalized) return 'Unknown';
    return normalized.charAt(0) + normalized.slice(1).toLowerCase();
};

const getPrimarySkill = (exam: PracticeExamListItemDto) => {
    const firstSkill = exam.skillTypes.find((skill) => normalizeToken(skill).length > 0);
    if (firstSkill) return normalizeToken(firstSkill);
    if ((exam.readingQuestionCount ?? 0) > 0) return 'READING';
    if ((exam.listeningQuestionCount ?? 0) > 0) return 'LISTENING';
    if ((exam.writingTaskCount ?? 0) > 0) return 'WRITING';
    if ((exam.speakingPartCount ?? 0) > 0) return 'SPEAKING';
    return '';
};

const getSkillTheme = (skill: string): SkillTheme => (
    skillThemeMap[normalizeToken(skill)] ?? {
        color: '#334155',
        soft: 'linear-gradient(135deg, rgba(248, 250, 252, 0.7) 0%, rgba(241, 245, 249, 0.5) 100%)',
        border: 'rgba(226, 232, 240, 0.5)',
        accent: '#475569',
        gradient: 'linear-gradient(135deg, #475569 0%, #64748b 100%)',
        shadow: 'rgba(100, 116, 139, 0.1)',
        icon: <AppstoreOutlined />,
    }
);

const getExamVolume = (exam: PracticeExamListItemDto, skill: string) => {
    switch (normalizeToken(skill)) {
        case 'READING':
            return { label: 'Số câu hỏi', value: `${exam.readingQuestionCount || 0} câu` };
        case 'LISTENING':
            return { label: 'Số câu hỏi', value: `${exam.listeningQuestionCount || 0} câu` };
        case 'WRITING':
            return { label: 'Số task', value: `${exam.writingTaskCount || 0} task` };
        case 'SPEAKING':
            return { label: 'Số part', value: `${exam.speakingPartCount || 0} part` };
        default:
            return { label: 'Nội dung', value: 'Đang cập nhật' };
    }
};

const containerVariants = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.06,
        },
    },
};

const cardVariants = {
    hidden: { opacity: 0, y: 24 },
    show: {
        opacity: 1,
        y: 0,
        transition: {
            type: 'spring' as const,
            stiffness: 100,
            damping: 16,
        },
    },
};

export const ClientPracticePage: FC = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { data: exams = [], isLoading } = usePracticeExamsQuery();
    const { data: mySessions = [] } = useMyPracticeSessionsQuery();

    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 9;

    const searchText = searchParams.get('search') ?? '';
    const selectedSkill = searchParams.get('skill') ?? 'ALL';
    const selectedExamType = searchParams.get('type') ?? 'ALL';

    useEffect(() => {
        setCurrentPage(1);
    }, [searchText, selectedSkill, selectedExamType]);

    const skillOptions = useMemo(
        () =>
            Array.from(
                new Set(
                    exams
                        .map((exam) => getPrimarySkill(exam))
                        .filter(Boolean)
                )
            ).sort(),
        [exams]
    );

    const examTypeOptions = useMemo(
        () =>
            Array.from(
                new Set(
                    exams
                        .map((exam) => exam.examType?.trim())
                        .filter((value): value is string => !!value)
                )
            ).sort((left, right) => left.localeCompare(right)),
        [exams]
    );

    const filteredExams = useMemo(() => {
        const normalizedSearch = searchText.trim().toLowerCase();
        const normalizedSkill = normalizeToken(selectedSkill);
        const normalizedExamType = (selectedExamType ?? '').trim().toLowerCase();

        return exams.filter((exam) => {
            const matchSearch =
                !normalizedSearch
                || exam.title.toLowerCase().includes(normalizedSearch)
                || (exam.description ?? '').toLowerCase().includes(normalizedSearch);

            const matchSkill =
                normalizedSkill === 'ALL'
                || getPrimarySkill(exam) === normalizedSkill;

            const matchExamType =
                normalizedExamType === 'all'
                || (exam.examType ?? '').trim().toLowerCase() === normalizedExamType;

            return matchSearch && matchSkill && matchExamType;
        });
    }, [exams, searchText, selectedSkill, selectedExamType]);

    const updateFilter = (key: string, value?: string) => {
        const nextParams = new URLSearchParams(searchParams);
        if (!value || value === 'ALL') {
            nextParams.delete(key);
        } else {
            nextParams.set(key, value);
        }

        if (key !== 'search') {
            const trimmedSearch = searchText.trim();
            if (trimmedSearch) {
                nextParams.set('search', trimmedSearch);
            } else {
                nextParams.delete('search');
            }
        }

        setSearchParams(nextParams);
    };

    const paginatedExams = useMemo(() => {
        const startIndex = (currentPage - 1) * pageSize;
        return filteredExams.slice(startIndex, startIndex + pageSize);
    }, [filteredExams, currentPage, pageSize]);

    const practiceCards = paginatedExams.map((exam) => {
        const primarySkill = getPrimarySkill(exam);
        const theme = getSkillTheme(primarySkill);
        const metric = getExamVolume(exam, primarySkill);

        const examSessions = mySessions.filter((s) => s.examId === exam.id);
        const hasInProgress = examSessions.some((s) => s.status === 'InProgress');
        const hasCompleted = examSessions.some((s) => s.status === 'Completed' || s.status === 'Submitted');

        const getStatusRibbon = () => {
            if (!hasInProgress && !hasCompleted) return null;

            const ribbonBg = hasInProgress
                ? 'linear-gradient(180deg, #f59e0b 0%, #d97706 100%)'
                : 'linear-gradient(180deg, #10b981 0%, #059669 100%)';

            const textLine1 = hasInProgress ? 'ĐANG' : 'ĐÃ';
            const textLine2 = hasInProgress ? 'LÀM' : 'LÀM';
            const shadowColor = hasInProgress ? 'rgba(217, 119, 6, 0.3)' : 'rgba(5, 150, 105, 0.3)';

            return (
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 24,
                        width: 40,
                        height: 52,
                        background: ribbonBg,
                        color: '#fff',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingBottom: 6,
                        fontWeight: 800,
                        fontSize: 9,
                        letterSpacing: '0.05em',
                        lineHeight: 1.2,
                        boxShadow: `0 4px 8px ${shadowColor}`,
                        clipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 50% 85%, 0% 100%)',
                        zIndex: 10,
                    }}
                >
                    <span>{textLine1}</span>
                    <span style={{ fontSize: 10, marginTop: 1 }}>{textLine2}</span>
                </div>
            );
        };

        return (
            <Col xs={24} md={12} xl={8} key={exam.id}>
                <motion.div
                    variants={cardVariants}
                    whileHover={{ y: -8, scale: 1.02 }}
                    style={{ height: '100%' }}
                >
                    <Card
                        hoverable
                        style={{
                            borderRadius: 24,
                            height: '100%',
                            border: `1px solid ${theme.border}`,
                            background: theme.soft,
                            boxShadow: `0 10px 30px -15px ${theme.shadow}`,
                            backdropFilter: 'blur(12px)',
                            overflow: 'hidden',
                            position: 'relative',
                        }}
                        styles={{ body: { display: 'flex', flexDirection: 'column', gap: 16, height: '100%', padding: 24 } }}
                    >
                        {getStatusRibbon()}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                            <Space
                                size={6}
                                wrap
                                style={{
                                    paddingLeft: (hasInProgress || hasCompleted) ? 48 : 0,
                                    transition: 'padding-left 0.3s ease',
                                }}
                            >
                                <Tag style={{ borderRadius: 999, paddingInline: 12, margin: 0, background: '#fff', borderColor: theme.border, color: theme.color, fontWeight: 600 }}>
                                    {formatSkillLabel(primarySkill || 'Practice')}
                                </Tag>
                                <Tag icon={<ClockCircleOutlined />} style={{ borderRadius: 999, paddingInline: 10, margin: 0, background: 'rgba(255, 255, 255, 0.6)', border: '1px solid rgba(0, 0, 0, 0.06)' }}>
                                    {exam.durationMinutes ? `${exam.durationMinutes} phút` : 'Không giới hạn'}
                                </Tag>
                            </Space>
                            <div
                                style={{
                                    width: 44,
                                    height: 44,
                                    borderRadius: 14,
                                    display: 'grid',
                                    placeItems: 'center',
                                    background: theme.gradient,
                                    color: '#fff',
                                    fontSize: 18,
                                    flexShrink: 0,
                                    boxShadow: `0 8px 20px -6px ${theme.accent}`,
                                }}
                            >
                                {theme.icon}
                            </div>
                        </div>

                        <div>
                            <Title level={4} style={{ margin: 0, color: '#1e293b', fontSize: 18, fontWeight: 700, lineHeight: 1.4 }}>
                                {exam.title}
                            </Title>
                            <Paragraph
                                style={{
                                    margin: '10px 0 0',
                                    color: '#64748b',
                                    fontSize: 14,
                                    lineHeight: 1.5,
                                    minHeight: 63,
                                }}
                                ellipsis={{ rows: 3 }}
                            >
                                {exam.description || 'Đề thi đã sẵn sàng để mở chi tiết và lựa chọn luyện tập.'}
                            </Paragraph>
                        </div>

                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                                gap: 8,
                                padding: 12,
                                background: 'rgba(255, 255, 255, 0.55)',
                                borderRadius: 16,
                                border: '1px solid rgba(255, 255, 255, 0.7)',
                            }}
                        >
                            <div>
                                <Text type="secondary" style={{ display: 'block', fontSize: 11, color: '#94a3b8' }}>
                                    Dạng đề
                                </Text>
                                <Text strong style={{ fontSize: 13, color: '#334155' }}>{exam.examType || 'Practice'}</Text>
                            </div>
                            <div>
                                <Text type="secondary" style={{ display: 'block', fontSize: 11, color: '#94a3b8' }}>
                                    {metric.label}
                                </Text>
                                <Text strong style={{ fontSize: 13, color: '#334155' }}>{metric.value}</Text>
                            </div>
                            <div>
                                <Text type="secondary" style={{ display: 'block', fontSize: 11, color: '#94a3b8' }}>
                                    Cập nhật
                                </Text>
                                <Text strong style={{ fontSize: 13, color: '#334155' }}>{formatDateTimeToMinute(exam.createdAt) || 'N/A'}</Text>
                            </div>
                        </div>

                        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 8 }}>
                            <Text type="secondary" style={{ fontSize: 12, color: '#94a3b8' }}>
                                Trạng thái: {hasInProgress ? 'Đang làm' : hasCompleted ? 'Đã làm' : 'Chưa làm'}
                            </Text>
                            <Button
                                type="primary"
                                onClick={() => navigate(`/app/practice/${exam.id}`)}
                                style={{
                                    borderRadius: 12,
                                    background: (!hasInProgress && hasCompleted)
                                        ? 'linear-gradient(135deg, #64748b 0%, #475569 100%)'
                                        : theme.gradient,
                                    borderColor: 'transparent',
                                    height: 38,
                                    fontWeight: 600,
                                    boxShadow: (!hasInProgress && hasCompleted)
                                        ? '0 4px 14px rgba(71, 85, 105, 0.25)'
                                        : `0 4px 14px ${theme.shadow}`,
                                }}
                            >
                                {(!hasInProgress && hasCompleted) ? 'Làm lại' : 'Luyện tập'} <RightOutlined />
                            </Button>
                        </div>
                    </Card>
                </motion.div>
            </Col>
        );
    });

    return (
        <div style={{ maxWidth: 1240, margin: '0 auto', paddingBottom: 40 }}>
            <Card
                style={{
                    borderRadius: 32,
                    marginBottom: 28,
                    background: 'radial-gradient(circle at top left, #eff6ff 0%, #f8fafc 45%, #f1f5f9 70%, #ecfeff 100%)',
                    border: '1px solid rgba(226, 232, 240, 0.8)',
                    boxShadow: '0 20px 40px -20px rgba(148, 163, 184, 0.12)',
                    position: 'relative',
                    overflow: 'hidden',
                }}
            >
                <motion.div
                    style={{
                        position: 'absolute',
                        top: -100,
                        left: -100,
                        width: 320,
                        height: 320,
                        borderRadius: '50%',
                        background: 'radial-gradient(circle, rgba(59, 130, 246, 0.12) 0%, rgba(255, 255, 255, 0) 70%)',
                        filter: 'blur(40px)',
                    }}
                    animate={{
                        x: [0, 30, 0],
                        y: [0, -20, 0],
                    }}
                    transition={{
                        repeat: Infinity,
                        duration: 12,
                        ease: 'easeInOut',
                    }}
                />
                <motion.div
                    style={{
                        position: 'absolute',
                        bottom: -80,
                        right: -80,
                        width: 280,
                        height: 280,
                        borderRadius: '50%',
                        background: 'radial-gradient(circle, rgba(16, 185, 129, 0.08) 0%, rgba(255, 255, 255, 0) 70%)',
                        filter: 'blur(35px)',
                    }}
                    animate={{
                        x: [0, -20, 0],
                        y: [0, 30, 0],
                    }}
                    transition={{
                        repeat: Infinity,
                        duration: 10,
                        ease: 'easeInOut',
                    }}
                />

                <Row gutter={[24, 24]} align="middle" style={{ position: 'relative', zIndex: 2 }}>
                    <Col xs={24} lg={16}>
                        <Space direction="vertical" size={16} style={{ width: '100%' }}>
                            <Tag style={{ width: 'fit-content', borderRadius: 999, paddingInline: 16, background: '#e0f2fe', color: '#0369a1', border: 'none', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Thư viện đề luyện thi AI
                            </Tag>
                            <Title level={2} style={{ margin: 0, color: '#0f172a', fontWeight: 800, fontSize: 28, letterSpacing: '-0.02em' }}>
                                Rèn luyện kỹ năng Tiếng Anh vượt trội
                            </Title>
                            <Paragraph style={{ margin: 0, maxWidth: 720, color: '#64748b', fontSize: 15, lineHeight: 1.6 }}>
                                Cung cấp kho đề thi mẫu đa dạng, phân loại rõ ràng theo từng kỹ năng Reading, Listening, Writing, Speaking. Hệ thống tự động đồng bộ hóa đề thi mới nhất để bạn sẵn sàng ôn luyện mọi lúc.
                            </Paragraph>
                            <Space size={[8, 8]} wrap style={{ marginTop: 8 }}>
                                {(['READING', 'LISTENING', 'WRITING', 'SPEAKING'] as const).map((skill) => {
                                    const theme = getSkillTheme(skill);
                                    const selected = normalizeToken(selectedSkill) === skill;
                                    return (
                                        <motion.div
                                            key={skill}
                                            whileHover={{ scale: 1.04 }}
                                            whileTap={{ scale: 0.96 }}
                                        >
                                            <Button
                                                type={selected ? 'primary' : 'default'}
                                                onClick={() => updateFilter('skill', selected ? 'ALL' : skill)}
                                                icon={theme.icon}
                                                style={selected ? {
                                                    borderRadius: 999,
                                                    background: theme.gradient,
                                                    borderColor: 'transparent',
                                                    fontWeight: 600,
                                                    height: 38,
                                                    boxShadow: `0 6px 20px -5px ${theme.accent}`,
                                                } : {
                                                    borderRadius: 999,
                                                    color: theme.color,
                                                    borderColor: theme.border,
                                                    background: theme.soft,
                                                    fontWeight: 600,
                                                    height: 38,
                                                }}
                                            >
                                                {formatSkillLabel(skill)}
                                            </Button>
                                        </motion.div>
                                    );
                                })}
                            </Space>
                        </Space>
                    </Col>
                    <Col xs={24} lg={8}>
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                                gap: 16,
                            }}
                        >
                            <Card style={{ borderRadius: 24, background: 'rgba(255, 255, 255, 0.65)', border: '1px solid rgba(255, 255, 255, 0.8)', boxShadow: '0 10px 25px -15px rgba(0, 0, 0, 0.05)', backdropFilter: 'blur(8px)' }}>
                                <Text type="secondary" style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>Đề phù hợp</Text>
                                <Title level={2} style={{ margin: '4px 0 0', color: '#0f172a', fontWeight: 800 }}>{filteredExams.length}</Title>
                            </Card>
                            <Card style={{ borderRadius: 24, background: 'rgba(255, 255, 255, 0.65)', border: '1px solid rgba(255, 255, 255, 0.8)', boxShadow: '0 10px 25px -15px rgba(0, 0, 0, 0.05)', backdropFilter: 'blur(8px)' }}>
                                <Text type="secondary" style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>Kỹ năng</Text>
                                <Title level={2} style={{ margin: '4px 0 0', color: '#0f172a', fontWeight: 800 }}>{skillOptions.length}</Title>
                            </Card>
                        </div>
                    </Col>
                </Row>
            </Card>

            <Card style={{ borderRadius: 24, marginBottom: 28, border: '1px solid rgba(226, 232, 240, 0.8)', boxShadow: '0 4px 20px -10px rgba(148, 163, 184, 0.08)' }}>
                <Row gutter={[16, 16]}>
                    <Col xs={24} md={12} lg={10}>
                        <Input
                            allowClear
                            value={searchText}
                            onChange={(event) => updateFilter('search', event.target.value)}
                            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                            placeholder="Tìm kiếm theo tên đề thi hoặc mô tả..."
                            size="large"
                            style={{ borderRadius: 14 }}
                        />
                    </Col>
                    <Col xs={24} md={6} lg={5}>
                        <Select
                            size="large"
                            value={selectedSkill}
                            onChange={(value) => updateFilter('skill', value)}
                            style={{ width: '100%' }}
                            dropdownStyle={{ borderRadius: 12 }}
                            options={[
                                { label: 'Tất cả kỹ năng', value: 'ALL' },
                                ...skillOptions.map((skill) => ({
                                    label: formatSkillLabel(skill),
                                    value: skill,
                                })),
                            ]}
                        />
                    </Col>
                    <Col xs={24} md={6} lg={5}>
                        <Select
                            size="large"
                            value={selectedExamType}
                            onChange={(value) => updateFilter('type', value)}
                            style={{ width: '100%' }}
                            dropdownStyle={{ borderRadius: 12 }}
                            options={[
                                { label: 'Tất cả loại đề', value: 'ALL' },
                                ...examTypeOptions.map((examType) => ({
                                    label: examType,
                                    value: examType,
                                })),
                            ]}
                        />
                    </Col>
                    <Col xs={24} lg={4}>
                        <Button
                            size="large"
                            style={{ width: '100%', borderRadius: 14, fontWeight: 600, color: '#475569' }}
                            onClick={() => setSearchParams(new URLSearchParams())}
                        >
                            Xóa bộ lọc
                        </Button>
                    </Col>
                </Row>
            </Card>

            {isLoading ? (
                <Row gutter={[20, 20]}>
                    {Array.from({ length: 6 }).map((_, index) => (
                        <Col xs={24} md={12} xl={8} key={index}>
                            <Card style={{ borderRadius: 24, border: '1px solid rgba(226, 232, 240, 0.8)' }}>
                                <Skeleton active paragraph={{ rows: 5 }} />
                            </Card>
                        </Col>
                    ))}
                </Row>
            ) : filteredExams.length === 0 ? (
                <Card style={{ borderRadius: 24, border: '1px solid rgba(226, 232, 240, 0.8)', padding: '40px 0' }}>
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description="Chưa có đề phù hợp với bộ lọc hiện tại."
                    />
                </Card>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
                    <motion.div
                        variants={containerVariants}
                        initial="hidden"
                        animate="show"
                    >
                        <Row gutter={[20, 20]}>
                            {practiceCards}
                        </Row>
                    </motion.div>

                    {filteredExams.length > pageSize && (
                        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
                            <Pagination
                                current={currentPage}
                                pageSize={pageSize}
                                total={filteredExams.length}
                                onChange={(page) => setCurrentPage(page)}
                                showSizeChanger={false}
                                style={{
                                    background: 'rgba(255, 255, 255, 0.6)',
                                    padding: '8px 16px',
                                    borderRadius: 16,
                                    border: '1px solid rgba(226, 232, 240, 0.8)',
                                    boxShadow: '0 4px 12px rgba(148, 163, 184, 0.05)',
                                }}
                            />
                        </div>
                    )}
                </div>
            )}

            {!isLoading && exams.length > 0 && (
                <Card style={{ borderRadius: 24, marginTop: 28, border: '1px solid rgba(226, 232, 240, 0.8)', background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)' }}>
                    <Space align="start" size={16}>
                        <div style={{ background: '#dbeafe', width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                            <FileSearchOutlined style={{ color: '#2563eb', fontSize: 18 }} />
                        </div>
                        <div>
                            <Text strong style={{ display: 'block', color: '#0f172a', fontSize: 14 }}>
                                Tự động cập nhật thư viện đề thi
                            </Text>
                            <Text type="secondary" style={{ fontSize: 13, color: '#64748b' }}>
                                Mọi đề thi mới xuất bản hoặc nội dung thay đổi sẽ tự động đồng bộ ngay lập tức mà không cần tải lại trang.
                            </Text>
                        </div>
                    </Space>
                </Card>
            )}
        </div>
    );
};
