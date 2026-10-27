import React from 'react';
import { Alert, Button, Card, Col, Row, Space, Tag, Typography } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { WRITING_SUBMIT_MIN_WORDS } from '../../utils/sessionReview.utils';

const { Title, Paragraph, Text } = Typography;

interface SummaryInfoCardItem {
    key: string;
    label: string;
    value: string;
}

interface SessionOverviewCardProps {
    canSubmitNow: boolean;
    canRetryWritingScore: boolean;
    isWritingSession: boolean;
    hasWritingScore: boolean;
    examTitle: string;
    objectiveSkillLabel: string;
    statusLabel: string;
    summaryInfoCards: SummaryInfoCardItem[];
    activeSubmitLoading: boolean;
    onBackToRunner: () => void;
    onSubmit: () => void;
}

export const SessionOverviewCard: React.FC<SessionOverviewCardProps> = ({
    canSubmitNow,
    canRetryWritingScore,
    isWritingSession,
    hasWritingScore,
    examTitle,
    objectiveSkillLabel,
    statusLabel,
    summaryInfoCards,
    activeSubmitLoading,
    onBackToRunner,
    onSubmit,
}) => {
    return (
        <Card style={{ borderRadius: 22 }}>
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
                {canSubmitNow ? (
                    <Alert
                        type="warning"
                        showIcon
                        message={
                            canRetryWritingScore
                                ? 'Writing đã nộp nhưng chưa có điểm'
                                : isWritingSession
                                    ? 'Bạn sắp nộp bài Writing'
                                    : 'Bạn sắp nộp bài objective'
                        }
                        description={
                            canRetryWritingScore
                                ? 'Bạn có thể bấm chấm lại để gọi AI scoring cho bài đã lưu.'
                                : isWritingSession
                                    ? `Mỗi task cần tối thiểu ${WRITING_SUBMIT_MIN_WORDS} từ. Sau khi nộp, hệ thống sẽ gọi AI để chấm Writing.`
                                    : 'Sau khi nộp, session sẽ chuyển sang Completed và hiện kết quả objective ngay tại trang này.'
                        }
                    />
                ) : isWritingSession ? (
                    <Alert
                        type="success"
                        showIcon
                        message="Bài Writing đã được nộp"
                        description={
                            hasWritingScore
                                ? 'AI đã trả điểm và feedback Writing.'
                                : 'Bài viết đã được lưu. Nếu chưa có điểm, kiểm tra cấu hình Gemini/API key hoặc thử nộp lại.'
                        }
                    />
                ) : null}

                <div
                    style={{
                        padding: 22,
                        borderRadius: 22,
                        border: '1px solid #dbeafe',
                        background: 'linear-gradient(135deg, #f8fbff 0%, #ffffff 48%, #f0fdf4 100%)',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
                    }}
                >
                    <Space direction="vertical" size={18} style={{ width: '100%' }}>
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: 16,
                                alignItems: 'flex-start',
                                flexWrap: 'wrap',
                            }}
                        >
                            <div style={{ minWidth: 0 }}>
                                <Text
                                    style={{
                                        display: 'inline-block',
                                        marginBottom: 8,
                                        fontSize: 12,
                                        fontWeight: 800,
                                        letterSpacing: '0.08em',
                                        textTransform: 'uppercase',
                                        color: '#2563eb',
                                    }}
                                >
                                    Tổng quan bài làm
                                </Text>
                                <Title level={3} style={{ margin: 0, color: '#0f172a' }}>
                                    {examTitle}
                                </Title>
                                <Paragraph style={{ margin: '8px 0 0', color: '#475569' }}>
                                    Kỹ năng <b>{objectiveSkillLabel}</b> · Trạng thái <b>{statusLabel}</b>
                                </Paragraph>
                            </div>
                            <Space wrap size={[8, 8]}>
                                <Tag
                                    style={{
                                        margin: 0,
                                        padding: '6px 12px',
                                        borderRadius: 999,
                                        borderColor: '#93c5fd',
                                        background: '#eff6ff',
                                        color: '#1d4ed8',
                                        fontWeight: 700,
                                    }}
                                >
                                    {objectiveSkillLabel}
                                </Tag>
                                <Tag
                                    style={{
                                        margin: 0,
                                        padding: '6px 12px',
                                        borderRadius: 999,
                                        borderColor: '#bbf7d0',
                                        background: '#f0fdf4',
                                        color: '#15803d',
                                        fontWeight: 700,
                                    }}
                                >
                                    {statusLabel}
                                </Tag>
                            </Space>
                        </div>

                        <Row gutter={[12, 12]}>
                            {summaryInfoCards.map((item) => (
                                <Col xs={24} sm={12} key={item.key}>
                                    <div
                                        style={{
                                            height: '100%',
                                            padding: 16,
                                            borderRadius: 18,
                                            border: '1px solid #e2e8f0',
                                            background: 'rgba(255,255,255,0.92)',
                                        }}
                                    >
                                        <Text style={{ display: 'block', color: '#64748b', fontSize: 13 }}>
                                            {item.label}
                                        </Text>
                                        <Text
                                            strong
                                            style={{
                                                display: 'block',
                                                marginTop: 6,
                                                fontSize: 18,
                                                color: '#0f172a',
                                                lineHeight: 1.45,
                                            }}
                                        >
                                            {item.value}
                                        </Text>
                                    </div>
                                </Col>
                            ))}
                        </Row>
                    </Space>
                </div>

                {canSubmitNow ? (
                    <Space wrap>
                        <Button onClick={onBackToRunner}>
                            Quay lại làm tiếp
                        </Button>
                        <Button
                            type="primary"
                            icon={<SendOutlined />}
                            loading={activeSubmitLoading}
                            onClick={onSubmit}
                        >
                            {canRetryWritingScore ? 'Chấm lại Writing' : 'Nộp bài ngay'}
                        </Button>
                    </Space>
                ) : null}
            </Space>
        </Card>
    );
};

