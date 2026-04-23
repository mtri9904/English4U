import { useMemo, useState } from 'react';
import {
    Button,
    Card,
    Col,
    Descriptions,
    Drawer,
    Empty,
    Input,
    Row,
    Select,
    Space,
    Statistic,
    Table,
    Tag,
    Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EyeOutlined, ReloadOutlined } from '@ant-design/icons';
import { useAdminAttemptDetailQuery, useAdminAttemptsQuery } from '../api/attempt.api';
import type { AdminAttemptAnswerDto, AdminAttemptListItemDto } from '../types/attempt.types';
import { formatDateTimeToMinute } from '@/shared/lib/dateTime';

const { Title, Text, Paragraph } = Typography;

const statusColorMap: Record<string, string> = {
    NotStarted: 'default',
    InProgress: 'processing',
    Submitted: 'warning',
    Completed: 'success',
    Abandoned: 'error',
};

const skillColorMap: Record<string, string> = {
    READING: 'green',
    LISTENING: 'blue',
    WRITING: 'orange',
    SPEAKING: 'red',
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

const statusOptions = [
    { label: 'Tat ca trang thai', value: 'ALL' },
    { label: 'NotStarted', value: 'NotStarted' },
    { label: 'InProgress', value: 'InProgress' },
    { label: 'Submitted', value: 'Submitted' },
    { label: 'Completed', value: 'Completed' },
    { label: 'Abandoned', value: 'Abandoned' },
];

export const AttemptManagementPage = () => {
    const [search, setSearch] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('ALL');
    const [selectedSessionId, setSelectedSessionId] = useState<string>('');

    const queryParams = useMemo(() => ({
        search: search.trim() || undefined,
        status: selectedStatus === 'ALL' ? undefined : selectedStatus,
    }), [search, selectedStatus]);

    const {
        data: attempts = [],
        isLoading,
        refetch,
        isFetching,
    } = useAdminAttemptsQuery(queryParams);

    const {
        data: selectedAttempt,
        isLoading: isAttemptDetailLoading,
    } = useAdminAttemptDetailQuery(selectedSessionId, !!selectedSessionId);

    const stats = useMemo(() => {
        const inProgress = attempts.filter((item) => item.status === 'InProgress').length;
        const completed = attempts.filter((item) => item.status === 'Completed').length;
        const submitted = attempts.filter((item) => item.status === 'Submitted').length;
        const avgScore = attempts.length > 0
            ? attempts.reduce((total, item) => total + (item.totalAutoScore ?? 0), 0) / attempts.length
            : 0;

        return { total: attempts.length, inProgress, completed, submitted, avgScore };
    }, [attempts]);

    const columns: ColumnsType<AdminAttemptListItemDto> = [
        {
            title: 'User',
            dataIndex: 'userDisplayName',
            key: 'userDisplayName',
            render: (_, record) => (
                <div>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>{record.userDisplayName}</div>
                    <div style={{ color: '#64748b', fontSize: 12 }}>{record.userEmail}</div>
                </div>
            ),
        },
        {
            title: 'De thi',
            dataIndex: 'examTitle',
            key: 'examTitle',
            render: (_, record) => (
                <div>
                    <div style={{ fontWeight: 600 }}>{record.examTitle}</div>
                    <Space size={6} wrap style={{ marginTop: 4 }}>
                        <Tag color={skillColorMap[record.skillType] || 'default'}>{record.skillType}</Tag>
                        <Tag>{record.examType || 'Practice'}</Tag>
                    </Space>
                </div>
            ),
        },
        {
            title: 'Tien do',
            key: 'progress',
            render: (_, record) => (
                <div>
                    <div style={{ fontWeight: 700 }}>{record.answeredQuestions}/{record.totalQuestions}</div>
                    <div style={{ color: '#64748b', fontSize: 12 }}>
                        Resume: {record.resumeQuestionNumber ? `Q${record.resumeQuestionNumber}` : 'Chua co'}
                    </div>
                </div>
            ),
        },
        {
            title: 'Trang thai',
            dataIndex: 'status',
            key: 'status',
            render: (value: string) => <Tag color={statusColorMap[value] || 'default'}>{value}</Tag>,
        },
        {
            title: 'Diem objective',
            key: 'totalAutoScore',
            render: (_, record) => (
                <div style={{ fontWeight: 700 }}>
                    {record.totalAutoScore != null ? record.totalAutoScore.toFixed(1) : '0.0'}
                </div>
            ),
        },
        {
            title: 'Bat dau',
            dataIndex: 'startedAt',
            key: 'startedAt',
            render: (value: string) => formatDateTimeToMinute(value) || 'N/A',
        },
        {
            title: 'Thao tac',
            key: 'actions',
            render: (_, record) => (
                <Button
                    icon={<EyeOutlined />}
                    onClick={() => setSelectedSessionId(record.sessionId)}
                >
                    Xem
                </Button>
            ),
        },
    ];

    return (
        <Space direction="vertical" size={20} style={{ width: '100%' }}>
            <Card
                style={{
                    borderRadius: 24,
                    border: '1px solid #dbeafe',
                    background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 55%, #f8fafc 100%)',
                }}
            >
                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                    <Tag color="blue" style={{ width: 'fit-content', borderRadius: 999, paddingInline: 12 }}>
                        Luot thi
                    </Tag>
                    <Title level={3} style={{ margin: 0 }}>
                        Theo doi toan bo session dang lam va da nop
                    </Title>
                    <Paragraph style={{ margin: 0, color: '#475569', maxWidth: 900 }}>
                        CMS nay doc truc tiep tu `ExamSession` va `UserAnswer`, de ban kiem tra nhanh hoc vien dang lam de nao, da luu toi dau, da nop hay chua va ket qua objective hien co.
                    </Paragraph>
                </Space>
            </Card>

            <Row gutter={[16, 16]}>
                <Col xs={12} md={6}>
                    <Card style={{ borderRadius: 20 }}>
                        <Statistic title="Tong luot thi" value={stats.total} />
                    </Card>
                </Col>
                <Col xs={12} md={6}>
                    <Card style={{ borderRadius: 20 }}>
                        <Statistic title="Dang lam" value={stats.inProgress} />
                    </Card>
                </Col>
                <Col xs={12} md={6}>
                    <Card style={{ borderRadius: 20 }}>
                        <Statistic title="Da nop" value={stats.submitted} />
                    </Card>
                </Col>
                <Col xs={12} md={6}>
                    <Card style={{ borderRadius: 20 }}>
                        <Statistic title="Diem TB objective" value={Number.isFinite(stats.avgScore) ? stats.avgScore.toFixed(1) : '0.0'} />
                    </Card>
                </Col>
            </Row>

            <Card style={{ borderRadius: 24 }}>
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                    <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
                        <Space wrap>
                            <Input.Search
                                allowClear
                                placeholder="Tim theo user, email, ten de..."
                                style={{ width: 320 }}
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                onSearch={(value) => setSearch(value)}
                            />
                            <Select
                                style={{ width: 220 }}
                                value={selectedStatus}
                                options={statusOptions}
                                onChange={setSelectedStatus}
                            />
                        </Space>
                        <Button icon={<ReloadOutlined spin={isFetching} />} onClick={() => refetch()}>
                            Lam moi
                        </Button>
                    </Space>

                    <Table
                        rowKey="sessionId"
                        loading={isLoading}
                        columns={columns}
                        dataSource={attempts}
                        pagination={{ pageSize: 10, hideOnSinglePage: attempts.length <= 10 }}
                        locale={{
                            emptyText: (
                                <Empty
                                    description="Chua co luot thi nao khop bo loc hien tai."
                                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                                />
                            ),
                        }}
                    />
                </Space>
            </Card>

            <Drawer
                title="Chi tiet luot thi"
                width={720}
                open={!!selectedSessionId}
                onClose={() => setSelectedSessionId('')}
            >
                {isAttemptDetailLoading || !selectedAttempt ? (
                    <Empty description="Dang tai chi tiet luot thi..." image={Empty.PRESENTED_IMAGE_SIMPLE} />
                ) : (
                    <Space direction="vertical" size={20} style={{ width: '100%' }}>
                        <Descriptions
                            bordered
                            size="small"
                            column={1}
                            items={[
                                { key: 'user', label: 'Hoc vien', children: `${selectedAttempt.userDisplayName} (${selectedAttempt.userEmail})` },
                                { key: 'exam', label: 'De thi', children: `${selectedAttempt.examTitle} - ${selectedAttempt.skillType}` },
                                { key: 'status', label: 'Trang thai', children: <Tag color={statusColorMap[selectedAttempt.status] || 'default'}>{selectedAttempt.status}</Tag> },
                                { key: 'startedAt', label: 'Bat dau', children: formatDateTimeToMinute(selectedAttempt.startedAt) || 'N/A' },
                                { key: 'endedAt', label: 'Ket thuc', children: formatDateTimeToMinute(selectedAttempt.endedAt) || 'Chua nop' },
                                { key: 'resume', label: 'Dang dung o dau', children: selectedAttempt.resumeQuestionNumber ? `Q${selectedAttempt.resumeQuestionNumber}` : 'Chua co du lieu' },
                                { key: 'timer', label: 'Thoi gian con lai', children: formatSeconds(selectedAttempt.timeRemaining) },
                            ]}
                        />

                        <Row gutter={[12, 12]}>
                            <Col xs={12} md={6}>
                                <Card size="small" style={{ borderRadius: 16 }}>
                                    <Statistic title="Da tra loi" value={`${selectedAttempt.answeredQuestions}/${selectedAttempt.totalQuestions}`} />
                                </Card>
                            </Col>
                            <Col xs={12} md={6}>
                                <Card size="small" style={{ borderRadius: 16 }}>
                                    <Statistic title="Diem objective" value={selectedAttempt.result?.totalAutoScore?.toFixed(1) || '0.0'} />
                                </Card>
                            </Col>
                            <Col xs={12} md={6}>
                                <Card size="small" style={{ borderRadius: 16 }}>
                                    <Statistic title="Dung" value={selectedAttempt.result?.correctQuestions ?? 0} />
                                </Card>
                            </Col>
                            <Col xs={12} md={6}>
                                <Card size="small" style={{ borderRadius: 16 }}>
                                    <Statistic title="Accuracy" value={`${selectedAttempt.result?.accuracyPercent ?? 0}%`} />
                                </Card>
                            </Col>
                        </Row>

                        <Card title="Danh sach cau da luu" style={{ borderRadius: 20 }}>
                            <Space direction="vertical" size={10} style={{ width: '100%' }}>
                                {selectedAttempt.answers.length === 0 ? (
                                    <Empty description="Session nay chua co cau tra loi nao." image={Empty.PRESENTED_IMAGE_SIMPLE} />
                                ) : selectedAttempt.answers.map((answer: AdminAttemptAnswerDto) => (
                                    <div
                                        key={answer.questionId}
                                        style={{
                                            border: '1px solid #e2e8f0',
                                            borderRadius: 14,
                                            padding: '12px 14px',
                                            background: '#fff',
                                        }}
                                    >
                                        <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
                                            <Space wrap>
                                                <Text strong>Cau {answer.questionNumber ?? 'N/A'}</Text>
                                                {answer.groupType && <Tag>{answer.groupType}</Tag>}
                                                {answer.isCorrect != null && (
                                                    <Tag color={answer.isCorrect ? 'success' : 'error'}>
                                                        {answer.isCorrect ? 'Dung' : 'Sai'}
                                                    </Tag>
                                                )}
                                            </Space>
                                            <Text type="secondary">{answer.scoreEarned} diem</Text>
                                        </Space>
                                        {answer.questionContent ? (
                                            <Paragraph style={{ margin: '8px 0 6px', color: '#334155' }}>
                                                {answer.questionContent}
                                            </Paragraph>
                                        ) : null}
                                        <div style={{ color: '#0f172a' }}>
                                            <b>Tra loi:</b> {answer.submittedAnswer || 'Chua nhap'}
                                        </div>
                                    </div>
                                ))}
                            </Space>
                        </Card>
                    </Space>
                )}
            </Drawer>
        </Space>
    );
};
