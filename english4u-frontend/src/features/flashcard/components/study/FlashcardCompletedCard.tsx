import React from 'react';
import { Card, Button, Typography, Space } from 'antd';
import { TrophyOutlined } from '@ant-design/icons';

const { Title, Paragraph } = Typography;

interface FlashcardCompletedCardProps {
    completedCount: number;
    totalCards: number;
    onRestart: () => void;
    onBackToDeck: () => void;
}

export const FlashcardCompletedCard: React.FC<FlashcardCompletedCardProps> = ({
    completedCount,
    totalCards,
    onRestart,
    onBackToDeck,
}) => {
    return (
        <div style={{ maxWidth: 650, margin: '60px auto', textAlign: 'center', padding: '0 16px' }}>
            <Card style={{ borderRadius: 24, padding: '40px 24px', boxShadow: '0 16px 40px rgba(0,0,0,0.06)' }}>
                <div
                    style={{
                        width: 80,
                        height: 80,
                        borderRadius: '50%',
                        background: '#f0fdf4',
                        color: '#16a34a',
                        fontSize: 36,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 20px',
                    }}
                >
                    <TrophyOutlined />
                </div>
                <Title level={2} style={{ color: '#0f172a', fontWeight: 800, margin: '0 0 12px' }}>
                    Hoàn thành phiên học!
                </Title>
                <Paragraph style={{ color: '#64748b', fontSize: '1rem', maxWidth: 450, margin: '0 auto 24px' }}>
                    Bạn đã xuất sắc ôn tập qua <strong>{completedCount > 0 ? completedCount : totalCards}</strong> từ
                    vựng trong bộ thẻ này. Hệ thống đã lưu lại tiến trình ghi nhớ của bạn!
                </Paragraph>
                <Space size="middle">
                    <Button
                        type="primary"
                        size="large"
                        onClick={onRestart}
                        style={{ height: 44, borderRadius: 12, fontWeight: 700 }}
                    >
                        Học lại từ đầu
                    </Button>
                    <Button
                        size="large"
                        onClick={onBackToDeck}
                        style={{ height: 44, borderRadius: 12, fontWeight: 600 }}
                    >
                        Về danh sách thẻ
                    </Button>
                </Space>
            </Card>
        </div>
    );
};

