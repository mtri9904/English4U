import React from 'react';
import { Card, Space, Typography, Row, Col } from 'antd';

const { Title, Paragraph, Text } = Typography;

export interface WritingScoringLoadingCardProps {
    activeSubmitLoading: boolean;
    writingScoringPhaseIndex: number;
    writingScoringStages: string[];
    submittedWritingTasks: number;
    totalTasks: number;
}

export const WritingScoringLoadingCard: React.FC<WritingScoringLoadingCardProps> = ({
    activeSubmitLoading,
    writingScoringPhaseIndex,
    writingScoringStages,
    submittedWritingTasks,
    totalTasks,
}) => {
    return (
        <Card
            style={{
                borderRadius: 24,
                border: '1px solid #bfdbfe',
                background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 52%, #f0fdf4 100%)',
                boxShadow: '0 20px 45px rgba(37, 99, 235, 0.08)',
                overflow: 'hidden',
            }}
        >
            <style>{`
                @keyframes writing-scoring-glow {
                    0% { transform: translateX(-35%); opacity: 0.2; }
                    50% { opacity: 0.95; }
                    100% { transform: translateX(165%); opacity: 0.2; }
                }
            `}</style>
            <Space direction="vertical" size={20} style={{ width: '100%' }}>
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 16,
                        flexWrap: 'wrap',
                        alignItems: 'flex-start',
                    }}
                >
                    <div style={{ minWidth: 0, maxWidth: 760 }}>
                        <Text
                            style={{
                                display: 'inline-block',
                                marginBottom: 10,
                                fontSize: 12,
                                fontWeight: 800,
                                letterSpacing: '0.08em',
                                textTransform: 'uppercase',
                                color: '#2563eb',
                            }}
                        >
                            AI đang chấm bài Writing
                        </Text>
                        <Title level={3} style={{ margin: 0, color: '#0f172a' }}>
                            Bài viết đã được lưu, đang chờ band score và feedback
                        </Title>
                        <Paragraph style={{ margin: '10px 0 0', color: '#475569', maxWidth: 720 }}>
                            Hệ thống đang tự động chấm bài theo các tiêu chí IELTS Writing. Bạn chưa cần hỏi AI ở
                            bước này; kết quả và nút AI gia sư sẽ xuất hiện sau khi chấm xong.
                        </Paragraph>
                    </div>
                    <div
                        style={{
                            padding: '10px 14px',
                            borderRadius: 999,
                            border: '1px solid #bfdbfe',
                            background: '#ffffff',
                            color: '#1d4ed8',
                            fontWeight: 800,
                            boxShadow: '0 10px 24px rgba(37, 99, 235, 0.08)',
                        }}
                    >
                        {submittedWritingTasks}/{totalTasks} task đã lưu
                    </div>
                </div>

                <div
                    style={{
                        position: 'relative',
                        height: 18,
                        borderRadius: 999,
                        background: 'rgba(191, 219, 254, 0.45)',
                        overflow: 'hidden',
                        border: '1px solid #dbeafe',
                    }}
                >
                    <div
                        style={{
                            position: 'absolute',
                            inset: 0,
                            width: `${activeSubmitLoading ? 34 + (writingScoringPhaseIndex % 3) * 9 : 64 + (writingScoringPhaseIndex % 5) * 5}%`,
                            borderRadius: 999,
                            background: 'linear-gradient(90deg, #2563eb 0%, #38bdf8 100%)',
                            transition: 'width 1.2s ease',
                        }}
                    />
                    <div
                        style={{
                            position: 'absolute',
                            top: 0,
                            bottom: 0,
                            width: '36%',
                            background:
                                'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.55) 50%, rgba(255,255,255,0) 100%)',
                            animation: 'writing-scoring-glow 2.2s linear infinite',
                        }}
                    />
                </div>

                <div
                    style={{
                        padding: 18,
                        borderRadius: 20,
                        border: '1px solid #dbeafe',
                        background: '#ffffff',
                        boxShadow: '0 12px 28px rgba(15, 23, 42, 0.05)',
                    }}
                >
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                        <Text strong style={{ color: '#0f172a', fontSize: 16 }}>
                            {writingScoringStages[writingScoringPhaseIndex % writingScoringStages.length]}
                        </Text>
                        <Row gutter={[12, 12]}>
                            {[
                                'Phân tích đề bài',
                                'Đánh giá nội dung',
                                'Kiểm tra từ vựng và ngữ pháp',
                                'Tổng hợp điểm và feedback',
                            ].map((step, index) => {
                                const isActive = index === (writingScoringPhaseIndex % 4);
                                const isCompleted = index < (writingScoringPhaseIndex % 4);

                                return (
                                    <Col xs={24} sm={12} md={6} key={step}>
                                        <div
                                            style={{
                                                height: '100%',
                                                padding: 14,
                                                borderRadius: 16,
                                                border: isActive
                                                    ? '1px solid #93c5fd'
                                                    : isCompleted
                                                      ? '1px solid #bbf7d0'
                                                      : '1px solid #e2e8f0',
                                                background: isActive
                                                    ? '#eff6ff'
                                                    : isCompleted
                                                      ? '#f0fdf4'
                                                      : '#f8fafc',
                                            }}
                                        >
                                            <Text
                                                strong
                                                style={{
                                                    color: isActive ? '#1d4ed8' : isCompleted ? '#15803d' : '#334155',
                                                }}
                                            >
                                                {step}
                                            </Text>
                                        </div>
                                    </Col>
                                );
                            })}
                        </Row>
                    </Space>
                </div>
            </Space>
        </Card>
    );
};

