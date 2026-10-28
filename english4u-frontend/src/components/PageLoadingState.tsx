import React from 'react';
import { Card, Col, Row, Skeleton, Spin } from 'antd';

export interface PageLoadingStateProps {
    type?: 'spin' | 'skeleton' | 'cards';
    tip?: string;
    rows?: number;
    cardCount?: number;
    style?: React.CSSProperties;
}

export const PageLoadingState: React.FC<PageLoadingStateProps> = ({
    type = 'skeleton',
    tip = 'Đang tải dữ liệu...',
    rows = 6,
    cardCount = 6,
    style,
}) => {
    if (type === 'spin') {
        return (
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: 320,
                    padding: '40px 20px',
                    gap: 16,
                    ...style,
                }}
            >
                <Spin size="large" />
                {tip && <span style={{ color: '#64748b', fontSize: '0.9rem' }}>{tip}</span>}
            </div>
        );
    }

    if (type === 'cards') {
        return (
            <div style={{ padding: '8px 0', ...style }}>
                <Row gutter={[20, 20]}>
                    {Array.from({ length: cardCount }).map((_, index) => (
                        <Col xs={24} md={12} xl={8} key={index}>
                            <Card
                                style={{
                                    borderRadius: 20,
                                    border: '1px solid #f1f5f9',
                                    boxShadow: '0 4px 12px rgba(148, 163, 184, 0.05)',
                                }}
                            >
                                <Skeleton active paragraph={{ rows: 4 }} />
                            </Card>
                        </Col>
                    ))}
                </Row>
            </div>
        );
    }

    return (
        <Card
            style={{
                borderRadius: 24,
                border: '1px solid #f1f5f9',
                padding: '12px 16px',
                boxShadow: '0 4px 16px rgba(148, 163, 184, 0.05)',
                ...style,
            }}
        >
            {tip && (
                <div style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: 16 }}>
                    {tip}
                </div>
            )}
            <Skeleton active paragraph={{ rows }} />
        </Card>
    );
};

