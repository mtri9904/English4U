import React from 'react';
import { Space, Typography, Row, Col } from 'antd';

const { Title, Paragraph, Text } = Typography;

export interface ObjectiveStatCardItem {
    key: string;
    label: string;
    value: string;
    accent: string;
    tone: string;
}

export interface ObjectiveSummaryCardProps {
    objectiveSkillLabel: string;
    correctQuestions: number;
    totalQuestions: number;
    objectiveBandValue: string;
    objectiveStatCards: ObjectiveStatCardItem[];
}

export const ObjectiveSummaryCard: React.FC<ObjectiveSummaryCardProps> = ({
    objectiveSkillLabel,
    correctQuestions,
    totalQuestions,
    objectiveBandValue,
    objectiveStatCards,
}) => {
    return (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <div
                style={{
                    padding: 22,
                    borderRadius: 22,
                    background: 'linear-gradient(135deg, #0f172a 0%, #1d4ed8 58%, #38bdf8 100%)',
                    color: '#ffffff',
                    boxShadow: '0 18px 36px rgba(37, 99, 235, 0.24)',
                }}
            >
                <Text
                    style={{
                        display: 'inline-block',
                        color: 'rgba(255,255,255,0.8)',
                        fontSize: 12,
                        fontWeight: 800,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                    }}
                >
                    Kết quả bài trắc nghiệm
                </Text>
                <Title level={3} style={{ margin: '10px 0 8px', color: '#ffffff' }}>
                    {objectiveSkillLabel}
                </Title>
                <Paragraph style={{ margin: 0, color: 'rgba(255,255,255,0.82)' }}>
                    Bạn làm đúng <b style={{ color: '#ffffff' }}>{correctQuestions}</b> trên{' '}
                    <b style={{ color: '#ffffff' }}>{totalQuestions}</b> câu của bài này.
                </Paragraph>

                <div
                    style={{
                        marginTop: 18,
                        padding: 18,
                        borderRadius: 18,
                        background: 'rgba(255,255,255,0.12)',
                        border: '1px solid rgba(255,255,255,0.18)',
                        backdropFilter: 'blur(10px)',
                    }}
                >
                    <Text style={{ display: 'block', color: 'rgba(255,255,255,0.72)', fontSize: 13 }}>
                        Điểm số
                    </Text>
                    <Text
                        strong
                        style={{
                            display: 'block',
                            marginTop: 4,
                            fontSize: 42,
                            lineHeight: 1.05,
                            color: '#ffffff',
                            letterSpacing: '-0.03em',
                        }}
                    >
                        {objectiveBandValue}
                    </Text>
                </div>
            </div>

            <Row gutter={[12, 12]}>
                {objectiveStatCards.map((item) => (
                    <Col xs={12} key={item.key}>
                        <div
                            style={{
                                height: '100%',
                                padding: 16,
                                borderRadius: 18,
                                border: '1px solid #e2e8f0',
                                background: item.tone,
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
                                    fontSize: 28,
                                    lineHeight: 1.1,
                                    color: item.accent,
                                }}
                            >
                                {item.value}
                            </Text>
                        </div>
                    </Col>
                ))}
            </Row>
        </Space>
    );
};

