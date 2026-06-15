import { useMemo, type FC, type ReactNode } from 'react';
import {
    Button,
    Card,
    Col,
    Empty,
    Input,
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
import type { PracticeExamListItemDto } from '../types/practice.types';
import { formatDateTimeToMinute } from '@/shared/lib/dateTime';

const { Title, Paragraph, Text } = Typography;

const skillThemeMap: Record<string, { color: string; soft: string; border: string; accent: string; icon: ReactNode }> = {
    READING: {
        color: '#15803d',
        soft: 'linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)',
        border: '#bbf7d0',
        accent: '#16a34a',
        icon: <FileTextOutlined />,
    },
    LISTENING: {
        color: '#1d4ed8',
        soft: 'linear-gradient(135deg, #eff6ff 0%, #f8fbff 100%)',
        border: '#bfdbfe',
        accent: '#2563eb',
        icon: <AudioOutlined />,
    },
    WRITING: {
        color: '#b45309',
        soft: 'linear-gradient(135deg, #fffbeb 0%, #fff7ed 100%)',
        border: '#fde68a',
        accent: '#d97706',
        icon: <EditOutlined />,
    },
    SPEAKING: {
        color: '#b91c1c',
        soft: 'linear-gradient(135deg, #fef2f2 0%, #fff5f5 100%)',
        border: '#fecaca',
        accent: '#dc2626',
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

const getSkillTheme = (skill: string) => (
    skillThemeMap[normalizeToken(skill)] ?? {
        color: '#334155',
        soft: 'linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)',
        border: '#e2e8f0',
        accent: '#475569',
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

export const ClientPracticePage: FC = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { data: exams = [], isLoading } = usePracticeExamsQuery();

    const searchText = searchParams.get('search') ?? '';
    const selectedSkill = searchParams.get('skill') ?? 'ALL';
    const selectedExamType = searchParams.get('type') ?? 'ALL';

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

    const practiceCards = filteredExams.map((exam, index) => (
        <Col xs={24} md={12} xl={8} key={exam.id}>
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24, delay: index * 0.04 }}
                style={{ height: '100%' }}
            >
                {(() => {
                    const primarySkill = getPrimarySkill(exam);
                    const theme = getSkillTheme(primarySkill);
                    const metric = getExamVolume(exam, primarySkill);

                    return (
                        <Card
                            hoverable
                            style={{
                                borderRadius: 22,
                                height: '100%',
                                border: `1px solid ${theme.border}`,
                                background: theme.soft,
                                overflow: 'hidden',
                            }}
                            styles={{ body: { display: 'flex', flexDirection: 'column', gap: 16, height: '100%' } }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                                <Space size={8} wrap>
                                    <Tag style={{ borderRadius: 999, paddingInline: 12, margin: 0, background: '#fff', borderColor: theme.border, color: theme.color }}>
                                        {formatSkillLabel(primarySkill || 'Practice')}
                                    </Tag>
                                    <Tag icon={<ClockCircleOutlined />} style={{ borderRadius: 999, paddingInline: 10, margin: 0 }}>
                                        {exam.durationMinutes ? `${exam.durationMinutes} phút` : 'Không giới hạn'}
                                    </Tag>
                                </Space>
                                <div
                                    style={{
                                        width: 48,
                                        height: 48,
                                        borderRadius: 16,
                                        display: 'grid',
                                        placeItems: 'center',
                                        background: '#fff',
                                        border: `1px solid ${theme.border}`,
                                        color: theme.accent,
                                        fontSize: 20,
                                        flexShrink: 0,
                                    }}
                                >
                                    {theme.icon}
                                </div>
                            </div>

                            <div>
                                <Title level={4} style={{ margin: 0, color: '#0f172a' }}>
                                    {exam.title}
                                </Title>
                                <Paragraph
                                    style={{
                                        margin: '10px 0 0',
                                        color: '#475569',
                                        minHeight: 66,
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
                                    gap: 10,
                                    padding: 14,
                                    background: 'rgba(255,255,255,0.76)',
                                    borderRadius: 18,
                                    border: '1px solid rgba(255,255,255,0.9)',
                                }}
                            >
                                <div>
                                    <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                                        Dạng đề
                                    </Text>
                                    <Text strong>{exam.examType || 'Practice'}</Text>
                                </div>
                                <div>
                                    <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                                        {metric.label}
                                    </Text>
                                    <Text strong>{metric.value}</Text>
                                </div>
                                <div>
                                    <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                                        Cập nhật
                                    </Text>
                                    <Text strong>{formatDateTimeToMinute(exam.createdAt) || 'N/A'}</Text>
                                </div>
                            </div>

                            <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    Đề thi {formatSkillLabel(primarySkill || 'Practice')} đã sẵn sàng để mở chi tiết.
                                </Text>
                                <Button
                                    type="primary"
                                    onClick={() => navigate(`/app/practice/${exam.id}`)}
                                    style={{ borderRadius: 12, background: theme.accent, borderColor: theme.accent }}
                                >
                                    Xem đề <RightOutlined />
                                </Button>
                            </div>
                        </Card>
                    );
                })()}
            </motion.div>
        </Col>
    ));

    return (
        <div style={{ maxWidth: 1240, margin: '0 auto' }}>
            <Card
                style={{
                    borderRadius: 28,
                    marginBottom: 24,
                    background: 'radial-gradient(circle at top left, #dbeafe 0%, #eff6ff 28%, #f8fafc 58%, #ecfeff 100%)',
                    border: '1px solid #dbeafe',
                    overflow: 'hidden',
                }}
            >
                <Row gutter={[24, 24]} align="middle">
                    <Col xs={24} lg={15}>
                        <Space direction="vertical" size={12} style={{ width: '100%' }}>
                            <Tag color="blue" style={{ width: 'fit-content', borderRadius: 999, paddingInline: 12 }}>
                                Kho đề luyện thi
                            </Tag>
                            <Title level={2} style={{ margin: 0 }}>
                                Chọn đúng đề theo từng kỹ năng
                            </Title>
                            <Paragraph style={{ margin: 0, maxWidth: 760, color: '#475569', fontSize: 15 }}>
                                Tất cả đề ở đây được cập nhật tự động sau khi xuất bản. Mỗi đề chỉ gắn với một kỹ năng để bạn lọc nhanh, mở nhanh và theo dõi đúng mục tiêu luyện thi.
                            </Paragraph>
                            <Space size={[10, 10]} wrap>
                                {(['READING', 'LISTENING', 'WRITING', 'SPEAKING'] as const).map((skill) => {
                                    const theme = getSkillTheme(skill);
                                    const selected = normalizeToken(selectedSkill) === skill;
                                    return (
                                        <Button
                                            key={skill}
                                            type={selected ? 'primary' : 'default'}
                                            onClick={() => updateFilter('skill', selected ? 'ALL' : skill)}
                                            icon={theme.icon}
                                            style={selected ? {
                                                borderRadius: 999,
                                                background: theme.accent,
                                                borderColor: theme.accent,
                                            } : {
                                                borderRadius: 999,
                                                color: theme.color,
                                                borderColor: theme.border,
                                                background: '#fff',
                                            }}
                                        >
                                            {formatSkillLabel(skill)}
                                        </Button>
                                    );
                                })}
                            </Space>
                        </Space>
                    </Col>
                    <Col xs={24} lg={9}>
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                                gap: 12,
                            }}
                        >
                            <Card style={{ borderRadius: 20, background: 'rgba(255,255,255,0.76)', border: '1px solid rgba(191, 219, 254, 0.9)' }}>
                                <Text type="secondary">Đề đang mở</Text>
                                <Title level={3} style={{ margin: '6px 0 0' }}>{filteredExams.length}</Title>
                            </Card>
                            <Card style={{ borderRadius: 20, background: 'rgba(255,255,255,0.76)', border: '1px solid rgba(191, 219, 254, 0.9)' }}>
                                <Text type="secondary">Kỹ năng hiện có</Text>
                                <Title level={3} style={{ margin: '6px 0 0' }}>{skillOptions.length}</Title>
                            </Card>
                        </div>
                    </Col>
                </Row>
            </Card>

            <Card style={{ borderRadius: 20, marginBottom: 24 }}>
                <Row gutter={[12, 12]}>
                    <Col xs={24} md={12} lg={10}>
                        <Input
                            allowClear
                            value={searchText}
                            onChange={(event) => updateFilter('search', event.target.value)}
                            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                            placeholder="Tìm theo tên đề hoặc mô tả"
                            size="large"
                        />
                    </Col>
                    <Col xs={24} md={6} lg={5}>
                        <Select
                            size="large"
                            value={selectedSkill}
                            onChange={(value) => updateFilter('skill', value)}
                            style={{ width: '100%' }}
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
                            style={{ width: '100%' }}
                            onClick={() => setSearchParams(new URLSearchParams())}
                        >
                            Xóa lọc
                        </Button>
                    </Col>
                </Row>
            </Card>

            {isLoading ? (
                <Row gutter={[16, 16]}>
                    {Array.from({ length: 6 }).map((_, index) => (
                        <Col xs={24} md={12} xl={8} key={index}>
                            <Card style={{ borderRadius: 20 }}>
                                <Skeleton active paragraph={{ rows: 6 }} />
                            </Card>
                        </Col>
                    ))}
                </Row>
            ) : filteredExams.length === 0 ? (
                <Card style={{ borderRadius: 20 }}>
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description="Chưa có đề phù hợp với bộ lọc hiện tại."
                    />
                </Card>
            ) : (
                <Row gutter={[16, 16]}>
                    {practiceCards}
                </Row>
            )}

            {!isLoading && exams.length > 0 && (
                <Card style={{ borderRadius: 20, marginTop: 24 }}>
                    <Space align="start" size={12}>
                        <FileSearchOutlined style={{ color: '#2563eb', fontSize: 20, marginTop: 4 }} />
                        <div>
                            <Text strong style={{ display: 'block', color: '#0f172a' }}>
                                Danh sách đề thi được cập nhật tự động từ hệ thống
                            </Text>
                            <Text type="secondary">
                                Khi có đề mới được xuất bản hoặc nội dung đề thay đổi, thư viện luyện thi sẽ tự đồng bộ lại.
                            </Text>
                        </div>
                    </Space>
                </Card>
            )}
        </div>
    );
};
