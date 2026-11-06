import React from 'react';
import { Row, Col, Card, Progress, Tag } from 'antd';
import type { AdminBadgeStat } from '../types/leaderboard.types';
import { getTierBadgeStyle } from '../utils/leaderboard.utils';

interface AdminBadgeDistributionProps {
    badges: AdminBadgeStat[];
    totalLearners: number;
}

export const AdminBadgeDistribution: React.FC<AdminBadgeDistributionProps> = ({
    badges,
    totalLearners,
}) => {
    return (
        <Card
            bordered={false}
            style={{
                borderRadius: '16px',
                background: '#fff',
                boxShadow: '0 4px 16px rgba(15, 23, 42, 0.05)',
                marginBottom: '24px',
                border: '1px solid #e2e8f0',
            }}
            styles={{ body: { padding: '24px' } }}
        >
            <div style={{ marginBottom: '20px' }}>
                <h3 style={{ margin: 0, fontWeight: 700, fontSize: '18px', color: '#0f172a' }}>
                    🎖️ Phân Bổ Mở Khóa Danh Hiệu (Badge Distribution)
                </h3>
                <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '13px' }}>
                    Thống kê tỷ lệ học viên trong hệ thống đã chinh phục các danh hiệu học tập.
                </p>
            </div>

            <Row gutter={[16, 16]}>
                {badges.map((badge) => {
                    const tierStyle = getTierBadgeStyle(badge.tier, true);

                    return (
                        <Col xs={24} sm={12} lg={6} key={badge.id}>
                            <div
                                style={{
                                    border: tierStyle.border,
                                    borderRadius: '14px',
                                    padding: '16px',
                                    background: tierStyle.background,
                                    height: '100%',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    boxShadow: tierStyle.glow,
                                }}
                            >
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <div style={{ fontSize: '32px' }}>{badge.icon}</div>
                                        <Tag color={tierStyle.tagColor} style={{ textTransform: 'uppercase', fontSize: '10px', fontWeight: 700 }}>
                                            {badge.tier}
                                        </Tag>
                                    </div>

                                    <div style={{ fontWeight: 700, fontSize: '15px', color: '#0f172a', marginBottom: '4px' }}>
                                        {badge.title}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                                        Thưởng: <strong>+{badge.xpReward} XP</strong>
                                    </div>
                                </div>

                                <div style={{ marginTop: '16px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                                        <span style={{ color: '#475569' }}>Đã đạt được:</span>
                                        <span style={{ fontWeight: 700, color: '#0f172a' }}>
                                            {badge.unlockedCount} / {totalLearners} học viên
                                        </span>
                                    </div>
                                    <Progress
                                        percent={badge.unlockedPercentage}
                                        size="small"
                                        strokeColor={tierStyle.textColor || '#2563eb'}
                                        format={(percent) => `${percent}%`}
                                    />
                                </div>
                            </div>
                        </Col>
                    );
                })}
            </Row>
        </Card>
    );
};
