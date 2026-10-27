import React from 'react';
import { Card, Col, Row, Typography } from 'antd';
import {
    CheckCircleOutlined,
    StarOutlined,
    ThunderboltOutlined,
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import { fadeUp, formatPracticeMinutes } from '../../utils/student.utils';
import { formatDateTimeToMinute } from '@/shared/lib/dateTime';
import type { UserProfileDto } from '../../types/user.types';

const { Text } = Typography;

export interface ProfileStatCardsProps {
    profile: UserProfileDto;
}

export const ProfileStatCards: React.FC<ProfileStatCardsProps> = ({ profile }) => {
    const statCards = [
        {
            key: 'streak',
            label: 'Chuỗi học tập',
            value: `${profile.gamification.dailyStreakCount ?? 0} ngày`,
            detail: `Kỷ lục ${profile.gamification.longestStreakCount ?? 0} ngày liên tiếp`,
            icon: <ThunderboltOutlined style={{ color: '#ea580c' }} />,
            background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
        },
        {
            key: 'uniqueExams',
            label: 'Đề đã chinh phục',
            value: `${profile.learning.uniqueExamCompletedCount ?? 0}`,
            detail: `${profile.learning.completedSessionCount ?? 0} lượt hoàn thành`,
            icon: <CheckCircleOutlined style={{ color: '#2563eb' }} />,
            background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
        },
        {
            key: 'avgBand',
            label: 'Band trung bình',
            value: profile.learning.averageBandScore != null ? profile.learning.averageBandScore.toFixed(1) : '—',
            detail: profile.learning.bestBandScore != null ? `Best ${profile.learning.bestBandScore.toFixed(1)}` : 'Chưa có điểm',
            icon: <StarOutlined style={{ color: '#7c3aed' }} />,
            background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
        },
        {
            key: 'time',
            label: 'Thời gian luyện',
            value: formatPracticeMinutes(profile.learning.totalPracticeMinutes ?? 0),
            detail: formatDateTimeToMinute(profile.gamification.lastActivityAt) || 'Chưa có hoạt động',
            icon: <ThunderboltOutlined style={{ color: '#16a34a' }} />,
            background: 'linear-gradient(135deg, #ecfdf5 0%, #dcfce7 100%)',
        },
    ];

    return (
        <motion.div {...fadeUp(0.08)}>
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                {statCards.map((card) => (
                    <Col xs={24} sm={12} xl={6} key={card.key}>
                        <Card
                            bordered={false}
                            style={{ borderRadius: 22, background: card.background, height: '100%' }}
                            styles={{ body: { padding: 22 } }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                                <div>
                                    <Text style={{ color: '#64748b', fontSize: 13 }}>{card.label}</Text>
                                    <div style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', marginTop: 6 }}>
                                        {card.value}
                                    </div>
                                    <Text style={{ color: '#475569', fontSize: 13 }}>{card.detail}</Text>
                                </div>
                                <div
                                    style={{
                                        width: 46,
                                        height: 46,
                                        borderRadius: 16,
                                        background: 'rgba(255,255,255,0.72)',
                                        display: 'grid',
                                        placeItems: 'center',
                                        boxShadow: '0 8px 18px rgba(15, 23, 42, 0.06)',
                                        fontSize: 20,
                                    }}
                                >
                                    {card.icon}
                                </div>
                            </div>
                        </Card>
                    </Col>
                ))}
            </Row>
        </motion.div>
    );
};

