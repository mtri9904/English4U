import React from 'react';
import { Button, Card, Empty, Tag, Typography } from 'antd';
import { ArrowRightOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import { fadeUp, getSkillTone } from '../../utils/student.utils';
import { getSkillLabel } from '@/features/exam-taking';
import { formatDateTimeToMinute } from '@/shared/lib/dateTime';
import type { UserProfileDto } from '../../types/user.types';

const { Title, Text } = Typography;

export interface ProfileRecentActivitiesCardProps {
    profile: UserProfileDto;
    onNavigate: (path: string) => void;
}

export const ProfileRecentActivitiesCard: React.FC<ProfileRecentActivitiesCardProps> = ({
    profile,
    onNavigate,
}) => {
    const recentActivities = profile.recentExamActivities ?? [];

    return (
        <motion.div {...fadeUp(0.18)}>
            <Card
                bordered={false}
                style={{ borderRadius: 24, marginBottom: 24 }}
                styles={{ body: { padding: 24 } }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
                    <div>
                        <Title level={4} style={{ margin: 0 }}>Hoạt động gần đây</Title>
                        <Text style={{ color: '#64748b' }}>Những đề bạn đã hoàn thành gần nhất.</Text>
                    </div>
                    <Button type="link" icon={<ArrowRightOutlined />} onClick={() => onNavigate('/app/my-exams')}>
                        Xem tất cả
                    </Button>
                </div>

                {recentActivities.length === 0 ? (
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description="Bạn chưa hoàn thành đề nào để hiển thị lịch sử."
                    />
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {recentActivities.map((item) => {
                            const tone = getSkillTone(item.skillType);

                            return (
                                <button
                                    key={item.sessionId}
                                    type="button"
                                    onClick={() => onNavigate(`/app/sessions/${item.sessionId}/submit`)}
                                    style={{
                                        border: '1px solid #e2e8f0',
                                        borderRadius: 18,
                                        padding: 16,
                                        background: '#fff',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        width: '100%',
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                                        <div style={{ minWidth: 0 }}>
                                            <Text strong style={{ display: 'block', color: '#0f172a' }}>
                                                {item.examTitle}
                                            </Text>
                                            <Text style={{ color: '#64748b', fontSize: 13 }}>
                                                {formatDateTimeToMinute(item.completedAt) || item.completedAt}
                                            </Text>
                                        </div>
                                        <Tag
                                            style={{
                                                borderRadius: 999,
                                                margin: 0,
                                                padding: '4px 10px',
                                                color: tone.color,
                                                background: tone.background,
                                                borderColor: 'transparent',
                                            }}
                                        >
                                            {getSkillLabel(item.skillType)}
                                        </Tag>
                                    </div>
                                    <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                        <Text style={{ color: '#475569' }}>
                                            {item.bandScore != null ? `Band ${item.bandScore.toFixed(1)}` : 'Đã hoàn thành'}
                                        </Text>
                                        <Text style={{ color: '#2563eb', fontWeight: 700 }}>Mở kết quả</Text>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </Card>
        </motion.div>
    );
};

