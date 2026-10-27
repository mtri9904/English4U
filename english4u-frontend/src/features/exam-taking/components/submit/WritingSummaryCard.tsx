import React from 'react';
import { Card, Space, Typography, Tag, Row, Col, Statistic, Alert } from 'antd';
import type { PracticeSessionFeedbackDto } from '../../types/session.types';
import { WritingRadarChart } from './WritingRadarChart';

const { Title, Text } = Typography;

export interface WritingTaskChartItem {
    key: string;
    taskNumber: number;
    band?: number | null;
    feedbacks: PracticeSessionFeedbackDto[];
}

export interface WritingSummaryCardProps {
    submittedWritingTasks: number;
    totalTasks: number;
    writingScore?: number | null;
    writingFeedbacks: PracticeSessionFeedbackDto[];
    orderedWritingFeedbacks: PracticeSessionFeedbackDto[];
    writingTaskChartData: WritingTaskChartItem[];
}

export const WritingSummaryCard: React.FC<WritingSummaryCardProps> = ({
    submittedWritingTasks,
    totalTasks,
    writingScore,
    writingFeedbacks,
    orderedWritingFeedbacks,
    writingTaskChartData,
}) => {
    return (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Title level={5} style={{ margin: 0 }}>
                Bài nộp Writing
            </Title>
            <Row gutter={[12, 12]}>
                <Col span={12}>
                    <Statistic title="Task" value={`${submittedWritingTasks}/${totalTasks}`} />
                </Col>
                <Col span={12}>
                    <Statistic title="Điểm" value={writingScore != null ? writingScore.toFixed(1) : '—'} />
                </Col>
            </Row>
            {writingFeedbacks.length > 0 ? (
                <>
                    <div style={{ textAlign: 'center' }}>
                        <Text strong>Tổng hợp 2 task</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            Overall = (Task 1 x1 + Task 2 x2) / 3, làm tròn 0.5
                        </Text>
                    </div>
                    <WritingRadarChart feedbacks={orderedWritingFeedbacks} />
                    {writingTaskChartData.length > 0 ? (
                        <Row gutter={[12, 12]}>
                            {writingTaskChartData.map((task) => (
                                <Col xs={24} md={12} key={task.key}>
                                    <Card
                                        size="small"
                                        title={`Task ${task.taskNumber}`}
                                        extra={
                                            <Tag color="orange">
                                                {task.band != null ? `${task.band.toFixed(1)} điểm` : '—'}
                                            </Tag>
                                        }
                                        style={{
                                            borderRadius: 16,
                                            border: '1px solid #fed7aa',
                                            background: '#fffaf5',
                                        }}
                                    >
                                        <WritingRadarChart feedbacks={task.feedbacks} compact />
                                    </Card>
                                </Col>
                            ))}
                        </Row>
                    ) : null}
                </>
            ) : null}
            <Alert
                type={writingScore != null ? 'success' : 'warning'}
                showIcon
                message={writingScore != null ? 'Đã có điểm Writing' : 'Chưa có điểm Writing'}
                description={
                    writingScore != null
                        ? 'Mỗi task lấy trung bình 4 tiêu chí IELTS. Overall Writing dùng Task 1 hệ số 1 và Task 2 hệ số 2.'
                        : 'Bài đã lưu, nhưng chưa có kết quả AI. Kiểm tra backend log/API key nếu trạng thái không đổi.'
                }
            />
        </Space>
    );
};

