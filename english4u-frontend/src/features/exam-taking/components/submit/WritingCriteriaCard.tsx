import React from 'react';
import { Card, Col, Row, Space, Tag, Typography } from 'antd';
import type { PracticeSessionFeedbackDto } from '../../types/session.types';
import {
    writingCriteriaGuideMap,
    writingCriteriaLabels,
} from '../../utils/sessionReview.utils';

const { Title, Paragraph, Text } = Typography;

interface WritingCriteriaCardProps {
    orderedWritingFeedbacks: PracticeSessionFeedbackDto[];
}

export const WritingCriteriaCard: React.FC<WritingCriteriaCardProps> = ({
    orderedWritingFeedbacks,
}) => {
    if (!orderedWritingFeedbacks.length) {
        return null;
    }

    return (
        <Card
            style={{
                borderRadius: 22,
                border: '1px solid #fed7aa',
                background: 'linear-gradient(135deg, #fffaf5 0%, #ffffff 100%)',
            }}
        >
            <Space direction="vertical" size={14} style={{ width: '100%' }}>
                <div>
                    <Title level={5} style={{ margin: 0 }}>4 tiêu chí chấm Writing</Title>
                    <Paragraph style={{ margin: '6px 0 0', color: '#78716c' }}>
                        Điểm tổng hợp theo đúng 4 tiêu chí IELTS Writing cho bài này.
                    </Paragraph>
                </div>

                <Row gutter={[12, 12]}>
                    {orderedWritingFeedbacks.map((feedback) => (
                        <Col xs={24} sm={12} key={feedback.criteria}>
                            <div
                                style={{
                                    height: '100%',
                                    padding: 16,
                                    borderRadius: 18,
                                    border: '1px solid #ffedd5',
                                    background: '#ffffff',
                                }}
                            >
                                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                                    <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
                                        <Text strong style={{ color: '#9a3412' }}>
                                            {feedback.criteria}
                                            {writingCriteriaLabels[feedback.criteria]
                                                ? ` (${writingCriteriaLabels[feedback.criteria]})`
                                                : ''}
                                        </Text>
                                        <Tag color="orange" style={{ marginInlineEnd: 0 }}>
                                            {feedback.bandScore > 0 ? feedback.bandScore.toFixed(1) : '—'}
                                        </Tag>
                                    </Space>
                                    {writingCriteriaGuideMap[feedback.criteria] ? (
                                        <div style={{ color: '#57534e', fontSize: 13, lineHeight: 1.6 }}>
                                            <p style={{ margin: '0 0 4px' }}>{writingCriteriaGuideMap[feedback.criteria].desc}</p>
                                            <Text type="secondary" style={{ fontSize: 12 }}>
                                                Trọng tâm: {writingCriteriaGuideMap[feedback.criteria].focus}
                                            </Text>
                                        </div>
                                    ) : (
                                        <Text type="secondary">
                                            {feedback.comment || 'Chưa có diễn giải cho tiêu chí này.'}
                                        </Text>
                                    )}
                                </Space>
                            </div>
                        </Col>
                    ))}
                </Row>
            </Space>
        </Card>
    );
};

