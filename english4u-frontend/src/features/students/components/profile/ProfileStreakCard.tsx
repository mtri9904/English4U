import React from 'react';
import { Card, Typography } from 'antd';
import { FireOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import { fadeUp, getStreakSummary } from '../../utils/student.utils';
import { formatDateTimeToMinute } from '@/shared/lib/dateTime';
import type { UserProfileDto } from '../../types/user.types';

const { Title, Text, Paragraph } = Typography;

export interface ProfileStreakCardProps {
    profile: UserProfileDto;
}

export const ProfileStreakCard: React.FC<ProfileStreakCardProps> = ({ profile }) => {
    const streak = profile.gamification.dailyStreakCount ?? 0;
    const streakSummary = getStreakSummary(streak);

    return (
        <motion.div {...fadeUp(0.14)}>
            <Card
                bordered={false}
                style={{
                    borderRadius: 24,
                    marginBottom: 24,
                    background: streakSummary.background,
                    overflow: 'hidden',
                }}
                styles={{ body: { padding: 24 } }}
            >
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <div
                        style={{
                            width: 64,
                            height: 64,
                            borderRadius: 20,
                            display: 'grid',
                            placeItems: 'center',
                            background: streakSummary.accent,
                            boxShadow: `0 14px 26px ${streakSummary.accent}33`,
                            color: '#fff',
                            fontSize: 28,
                        }}
                    >
                        <FireOutlined />
                    </div>
                    <div>
                        <Title level={4} style={{ margin: 0 }}>{streakSummary.title}</Title>
                        <Paragraph style={{ margin: '6px 0 0', color: '#475569' }}>
                            {streakSummary.description}
                        </Paragraph>
                    </div>
                </div>

                <div
                    style={{
                        marginTop: 18,
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                        gap: 12,
                    }}
                >
                    <div style={{ padding: 16, borderRadius: 18, background: 'rgba(255,255,255,0.7)' }}>
                        <Text style={{ color: '#64748b', display: 'block', marginBottom: 4 }}>Longest streak</Text>
                        <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a' }}>
                            {profile.gamification.longestStreakCount ?? 0}
                        </div>
                    </div>
                    <div style={{ padding: 16, borderRadius: 18, background: 'rgba(255,255,255,0.7)' }}>
                        <Text style={{ color: '#64748b', display: 'block', marginBottom: 4 }}>Hoạt động gần nhất</Text>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                            {formatDateTimeToMinute(profile.gamification.lastActivityAt) || 'Chưa có'}
                        </div>
                    </div>
                </div>
            </Card>
        </motion.div>
    );
};
