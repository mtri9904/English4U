import React from 'react';
import { Row, Col, Card, Progress, Tag } from 'antd';
import { AimOutlined } from '@ant-design/icons';
import type { AdminQuestStat } from '../types/leaderboard.types';

interface AdminQuestOverviewCardProps {
    quests: AdminQuestStat[];
    totalLearners: number;
}

export const AdminQuestOverviewCard: React.FC<AdminQuestOverviewCardProps> = ({
    quests,
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
            }}
            bodyStyle={{ padding: '24px' }}
        >
            <div style={{ marginBottom: '20px' }}>
                <h3 style={{ margin: 0, fontWeight: 700, fontSize: '18px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AimOutlined style={{ color: '#3b82f6' }} />
                    <span>Thống Kê Thử Thách Tuần (Weekly Quests Engagement)</span>
                </h3>
                <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '13px' }}>
                    Đo lường mức độ tích cực tham gia các mục tiêu rèn luyện hàng tuần của học viên.
                </p>
            </div>

            <Row gutter={[16, 16]}>
                {quests.map((quest) => (
                    <Col xs={24} sm={12} lg={8} key={quest.id}>
                        <div
                            style={{
                                border: '1px solid #e2e8f0',
                                borderRadius: '14px',
                                padding: '16px',
                                background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
                                height: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                            }}
                        >
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <div style={{ fontSize: '28px' }}>{quest.icon}</div>
                                    <Tag color="cyan" style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
                                        +{quest.xpReward} XP
                                    </Tag>
                                </div>

                                <div style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a', marginBottom: '4px' }}>
                                    {quest.title}
                                </div>
                                <div style={{ fontSize: '12px', color: '#64748b' }}>
                                    Mục tiêu: <strong>{quest.target}</strong>
                                </div>
                            </div>

                            <div style={{ marginTop: '16px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                                    <span style={{ color: '#475569' }}>Học viên hoàn thành:</span>
                                    <span style={{ fontWeight: 700, color: '#059669' }}>
                                        {quest.completedLearnersCount} / {totalLearners} ({quest.completionRate}%)
                                    </span>
                                </div>
                                <Progress
                                    percent={quest.completionRate}
                                    size="small"
                                    strokeColor="#059669"
                                    format={(percent) => `${percent}%`}
                                />
                            </div>
                        </div>
                    </Col>
                ))}
            </Row>
        </Card>
    );
};

