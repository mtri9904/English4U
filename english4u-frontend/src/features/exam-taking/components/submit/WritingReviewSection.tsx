import React from 'react';
import { Card, Space, Typography, Tag, Button, Row, Col } from 'antd';
import { RobotOutlined } from '@ant-design/icons';
import type { PracticeSessionFeedbackDto } from '../../types/session.types';
import type { WritingCorrection } from './WritingRadarChart';

const { Title, Paragraph, Text } = Typography;

export interface WritingTaskSubmission {
    key: string;
    taskNumber: number;
    promptText: string;
    imageUrls: string[];
    minWords: number;
    answerText: string;
    wordCount: number;
}

export interface WritingTaskFeedbackSection {
    key: string;
    taskNumber: number;
    band?: number | null;
    feedbacks: PracticeSessionFeedbackDto[];
}

export interface WritingReviewSectionProps {
    writingTaskSubmissions: WritingTaskSubmission[];
    canUseWritingCopilot: boolean;
    onFocusWritingCopilotTask: (taskKey: string) => void;
    writingFeedbacks: PracticeSessionFeedbackDto[];
    writingTaskFeedbackSections: WritingTaskFeedbackSection[];
    writingCorrections: WritingCorrection[];
}

export const WritingReviewSection: React.FC<WritingReviewSectionProps> = ({
    writingTaskSubmissions,
    canUseWritingCopilot,
    onFocusWritingCopilotTask,
    writingFeedbacks,
    writingTaskFeedbackSections,
    writingCorrections,
}) => {
    return (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {/* Bài viết đã lưu */}
            <Card style={{ borderRadius: 22 }}>
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                    <div>
                        <Title level={4} style={{ margin: 0 }}>
                            Bài viết đã lưu
                        </Title>
                        <Paragraph style={{ margin: '6px 0 0', color: '#64748b' }}>
                            Nội dung dưới đây là bài viết đã được lưu từ lúc học viên làm bài.
                        </Paragraph>
                    </div>

                    <Space direction="vertical" size={16} style={{ width: '100%' }}>
                        {writingTaskSubmissions.map((task) => (
                            <Card
                                key={task.key}
                                size="small"
                                title={`Task ${task.taskNumber}`}
                                extra={
                                    <Space wrap size={[8, 8]}>
                                        <Tag color={task.wordCount >= task.minWords ? 'green' : 'orange'}>
                                            {task.wordCount} từ
                                        </Tag>
                                        {canUseWritingCopilot ? (
                                            <Button
                                                size="small"
                                                icon={<RobotOutlined style={{ color: '#8b5cf6' }} />}
                                                onClick={() => onFocusWritingCopilotTask(task.key)}
                                                className="hover:scale-102 hover:shadow-md transition-all duration-200"
                                                style={{
                                                    borderRadius: 999,
                                                    fontWeight: 600,
                                                    borderColor: '#c084fc',
                                                    background: 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)',
                                                    color: '#7e22ce',
                                                    boxShadow: '0 4px 10px rgba(168, 85, 247, 0.08)',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                }}
                                            >
                                                Hỏi AI gia sư
                                            </Button>
                                        ) : null}
                                    </Space>
                                }
                                style={{
                                    borderRadius: 18,
                                    border: '1px solid #dbeafe',
                                    background: 'linear-gradient(135deg, #f8fbff 0%, #ffffff 100%)',
                                }}
                            >
                                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                                    <div
                                        style={{
                                            padding: 14,
                                            borderRadius: 14,
                                            background: '#f8fafc',
                                            border: '1px solid #e2e8f0',
                                        }}
                                    >
                                        <Text strong>Đề bài</Text>
                                        <Paragraph style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>
                                            {task.promptText}
                                        </Paragraph>
                                    </div>

                                    {task.imageUrls.length > 0 ? (
                                        <div
                                            style={{
                                                padding: 14,
                                                borderRadius: 14,
                                                background: '#fff7ed',
                                                border: '1px solid #fed7aa',
                                            }}
                                        >
                                            <Text strong>Hình đề bài</Text>
                                            <Space
                                                direction="vertical"
                                                size={12}
                                                style={{ width: '100%', marginTop: 10 }}
                                            >
                                                {task.imageUrls.map((url) => (
                                                    <img
                                                        key={url}
                                                        src={url}
                                                        alt={`Writing task ${task.taskNumber} visual`}
                                                        style={{
                                                            display: 'block',
                                                            width: 'auto',
                                                            maxWidth: '100%',
                                                            maxHeight: 360,
                                                            margin: '0 auto',
                                                            borderRadius: 14,
                                                            border: '1px solid #fdba74',
                                                            objectFit: 'contain',
                                                        }}
                                                    />
                                                ))}
                                            </Space>
                                        </div>
                                    ) : null}

                                    <div
                                        style={{
                                            padding: 16,
                                            borderRadius: 14,
                                            background: '#ffffff',
                                            border: '1px solid #dbeafe',
                                            minHeight: 160,
                                        }}
                                    >
                                        <Text strong>Bài làm của học viên</Text>
                                        {task.answerText.trim() ? (
                                            <Paragraph
                                                style={{
                                                    margin: '10px 0 0',
                                                    whiteSpace: 'pre-wrap',
                                                    lineHeight: 1.75,
                                                }}
                                            >
                                                {task.answerText}
                                            </Paragraph>
                                        ) : (
                                            <Paragraph type="secondary" style={{ margin: '10px 0 0' }}>
                                                Task này chưa có nội dung được lưu.
                                            </Paragraph>
                                        )}
                                    </div>
                                </Space>
                            </Card>
                        ))}
                    </Space>
                </Space>
            </Card>

            {/* Feedback IELTS Writing */}
            {writingFeedbacks.length > 0 ? (
                <Card style={{ borderRadius: 22 }}>
                    <Space direction="vertical" size={16} style={{ width: '100%' }}>
                        <div>
                            <Title level={4} style={{ margin: 0 }}>
                                Feedback IELTS Writing
                            </Title>
                            <Paragraph style={{ margin: '6px 0 0', color: '#64748b' }}>
                                Feedback chi tiết theo từng part/task và 4 tiêu chí IELTS.
                            </Paragraph>
                        </div>

                        <Space direction="vertical" size={16} style={{ width: '100%' }}>
                            {writingTaskFeedbackSections.map((task) => (
                                <Card
                                    key={task.key}
                                    size="small"
                                    title={`Part ${task.taskNumber}`}
                                    extra={
                                        <Tag color="orange">
                                            Band {task.band != null ? task.band.toFixed(1) : '—'}
                                        </Tag>
                                    }
                                    style={{
                                        borderRadius: 18,
                                        border: '1px solid #fed7aa',
                                        background: 'linear-gradient(135deg, #fff7ed 0%, #ffffff 100%)',
                                    }}
                                >
                                    <Row gutter={[14, 14]}>
                                        {task.feedbacks.map((feedback) => (
                                            <Col xs={24} md={12} key={`${task.key}-${feedback.criteria}`}>
                                                <Card
                                                    size="small"
                                                    style={{
                                                        borderRadius: 14,
                                                        border: '1px solid #ffedd5',
                                                        background: '#ffffff',
                                                        height: '100%',
                                                    }}
                                                >
                                                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                                                        <Space
                                                            wrap
                                                            style={{
                                                                justifyContent: 'space-between',
                                                                width: '100%',
                                                            }}
                                                        >
                                                            <Text strong>{feedback.criteria}</Text>
                                                            <Tag color="orange">
                                                                {feedback.bandScore > 0
                                                                    ? feedback.bandScore.toFixed(1)
                                                                    : '—'}
                                                            </Tag>
                                                        </Space>
                                                        {feedback.comment ? (
                                                            <Text>{feedback.comment}</Text>
                                                        ) : (
                                                            <Text type="secondary">
                                                                Chưa có nhận xét cho tiêu chí này.
                                                            </Text>
                                                        )}
                                                        {feedback.improvements ? (
                                                            <Text type="secondary">
                                                                <b>Cải thiện:</b> {feedback.improvements}
                                                            </Text>
                                                        ) : null}
                                                    </Space>
                                                </Card>
                                            </Col>
                                        ))}
                                    </Row>
                                </Card>
                            ))}
                        </Space>

                        {writingCorrections.length > 0 ? (
                            <Card
                                size="small"
                                title="Các lỗi AI gợi ý sửa"
                                style={{ borderRadius: 16, border: '1px solid #e2e8f0' }}
                            >
                                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                                    {writingCorrections.slice(0, 8).map((correction, index) => (
                                        <div
                                            key={`${correction.start_index ?? index}-${correction.original_text ?? index}`}
                                            style={{
                                                padding: 12,
                                                borderRadius: 12,
                                                background: '#f8fafc',
                                                border: '1px solid #e2e8f0',
                                            }}
                                        >
                                            <Space direction="vertical" size={4} style={{ width: '100%' }}>
                                                {correction.criteria ? (
                                                    <Tag style={{ width: 'fit-content' }}>
                                                        {correction.criteria}
                                                    </Tag>
                                                ) : null}
                                                {correction.original_text ? (
                                                    <Text delete style={{ color: '#b91c1c' }}>
                                                        {correction.original_text}
                                                    </Text>
                                                ) : null}
                                                {correction.corrected_text ? (
                                                    <Text style={{ color: '#15803d' }}>
                                                        {correction.corrected_text}
                                                    </Text>
                                                ) : null}
                                                {correction.explanation ? (
                                                    <Text type="secondary">{correction.explanation}</Text>
                                                ) : null}
                                            </Space>
                                        </div>
                                    ))}
                                </Space>
                            </Card>
                        ) : null}
                    </Space>
                </Card>
            ) : null}
        </Space>
    );
};

