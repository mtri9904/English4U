import React from 'react';
import { Row, Col, Card } from 'antd';
import {
    TeamOutlined,
    ClockCircleOutlined,
    CheckCircleOutlined,
    FireFilled,
    AimOutlined,
    ThunderboltFilled,
} from '@ant-design/icons';
import type { AdminLeaderboardOverview } from '../types/leaderboard.types';

interface AdminLeaderboardKpisProps {
    data: AdminLeaderboardOverview;
}

export const AdminLeaderboardKpis: React.FC<AdminLeaderboardKpisProps> = ({ data }) => {
    const kpiCards = [
        {
            title: 'Tổng Học Viên Tham Gia',
            value: data.totalLearners.toLocaleString(),
            suffix: 'người',
            subtitle: `${data.activeLearners} đang tích cực luyện tập`,
            icon: <TeamOutlined style={{ fontSize: '24px', color: '#2563eb' }} />,
            bgGradient: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
            borderColor: '#bfdbfe',
            valueColor: '#1e40af',
        },
        {
            title: 'Tổng Giờ Ôn Luyện',
            value: `${data.totalStudyHours}`,
            suffix: 'giờ',
            subtitle: 'Thời gian làm bài thực tế',
            icon: <ClockCircleOutlined style={{ fontSize: '24px', color: '#059669' }} />,
            bgGradient: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
            borderColor: '#a7f3d0',
            valueColor: '#065f46',
        },
        {
            title: 'Bài Thi Hoàn Thành',
            value: data.totalExamsCompleted.toLocaleString(),
            suffix: 'lượt',
            subtitle: 'Phiên nộp bài có chấm điểm',
            icon: <CheckCircleOutlined style={{ fontSize: '24px', color: '#7c3aed' }} />,
            bgGradient: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
            borderColor: '#ddd6fe',
            valueColor: '#5b21b6',
        },
        {
            title: 'Kỷ Lục Chuỗi Ngày (Streak)',
            value: data.highestStreak,
            suffix: 'ngày',
            subtitle: 'Chuỗi học liên tục cao nhất',
            icon: <FireFilled style={{ fontSize: '24px', color: '#ea580c' }} />,
            bgGradient: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
            borderColor: '#fed7aa',
            valueColor: '#9a3412',
        },
        {
            title: 'Band Score Trung Bình',
            value: data.averageBandScore > 0 ? `Band ${data.averageBandScore.toFixed(1)}` : 'Đang tích lũy',
            suffix: '',
            subtitle: 'Điểm tổng hợp hệ thống',
            icon: <AimOutlined style={{ fontSize: '24px', color: '#0284c7' }} />,
            bgGradient: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
            borderColor: '#bae6fd',
            valueColor: '#0369a1',
        },
        {
            title: 'Tổng Điểm XP Đã Trao',
            value: data.totalXpAwarded.toLocaleString(),
            suffix: 'XP',
            subtitle: 'Tích lũy từ thi & nhiệm vụ',
            icon: <ThunderboltFilled style={{ fontSize: '24px', color: '#d97706' }} />,
            bgGradient: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
            borderColor: '#fde68a',
            valueColor: '#92400e',
        },
    ];

    return (
        <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
            {kpiCards.map((card, idx) => (
                <Col xs={24} sm={12} lg={8} xl={4} key={idx}>
                    <Card
                        bordered
                        style={{
                            borderRadius: '16px',
                            background: card.bgGradient,
                            borderColor: card.borderColor,
                            boxShadow: '0 4px 12px rgba(15, 23, 42, 0.04)',
                            height: '100%',
                        }}
                        bodyStyle={{ padding: '16px 14px' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>
                                {card.title}
                            </span>
                            <div
                                style={{
                                    width: '38px',
                                    height: '38px',
                                    borderRadius: '10px',
                                    background: '#fff',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                                }}
                            >
                                {card.icon}
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                            <span style={{ fontSize: '24px', fontWeight: 800, color: card.valueColor, lineHeight: 1.1 }}>
                                {card.value}
                            </span>
                            {card.suffix && (
                                <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>
                                    {card.suffix}
                                </span>
                            )}
                        </div>

                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px' }}>
                            {card.subtitle}
                        </div>
                    </Card>
                </Col>
            ))}
        </Row>
    );
};

