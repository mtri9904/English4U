import React from 'react';
import { Avatar, Button, Card, Col, Row, Tag, Typography, Upload } from 'antd';
import { CameraOutlined, MailOutlined, SafetyCertificateOutlined, UserOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import { fadeUp } from '../../utils/student.utils';
import { formatDateTimeToMinute } from '@/shared/lib/dateTime';
import type { UserProfileDto } from '../../types/user.types';

const { Title, Text, Paragraph } = Typography;

export interface ProfileHeroHeaderProps {
    profile: UserProfileDto;
    onAvatarUpload: (file: File) => Promise<boolean>;
    onNavigate: (path: string) => void;
}

export const ProfileHeroHeader: React.FC<ProfileHeroHeaderProps> = ({
    profile,
    onAvatarUpload,
    onNavigate,
}) => {
    const streak = profile.gamification.dailyStreakCount ?? 0;
    const longestStreak = profile.gamification.longestStreakCount ?? 0;

    return (
        <motion.div {...fadeUp(0)}>
            <div
                style={{
                    borderRadius: 28,
                    padding: 28,
                    marginBottom: 24,
                    background: 'linear-gradient(135deg, #e0f2fe 0%, #eef2ff 45%, #fff7ed 100%)',
                    position: 'relative',
                    overflow: 'hidden',
                }}
            >
                <div
                    style={{
                        position: 'absolute',
                        inset: 'auto -80px -80px auto',
                        width: 220,
                        height: 220,
                        borderRadius: '50%',
                        background: 'rgba(255,255,255,0.38)',
                        filter: 'blur(4px)',
                    }}
                />

                <Row gutter={[24, 24]} align="middle">
                    <Col xs={24} xl={14}>
                        <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                            <Upload accept="image/*" showUploadList={false} beforeUpload={onAvatarUpload}>
                                <div style={{ position: 'relative', cursor: 'pointer' }}>
                                    <Avatar
                                        size={110}
                                        icon={<UserOutlined />}
                                        src={profile.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.id}`}
                                        style={{
                                            border: '4px solid rgba(255,255,255,0.8)',
                                            boxShadow: '0 18px 40px rgba(15, 23, 42, 0.14)',
                                        }}
                                    />
                                    <div
                                        style={{
                                            position: 'absolute',
                                            right: 0,
                                            bottom: 0,
                                            width: 34,
                                            height: 34,
                                            borderRadius: 999,
                                            background: '#fff',
                                            display: 'grid',
                                            placeItems: 'center',
                                            boxShadow: '0 8px 20px rgba(15, 23, 42, 0.16)',
                                        }}
                                    >
                                        <CameraOutlined style={{ color: '#2563eb' }} />
                                    </div>
                                </div>
                            </Upload>

                            <div style={{ minWidth: 0, flex: '1 1 320px' }}>
                                <Text style={{ color: '#475569', fontSize: 14 }}>Hồ sơ học viên</Text>
                                <Title level={2} style={{ margin: '6px 0 4px', fontWeight: 800 }}>
                                    {profile.displayName || 'Học viên English4U'}
                                </Title>
                                <Paragraph style={{ color: '#475569', marginBottom: 12, maxWidth: 560 }}>
                                    Theo dõi chuỗi ngày học liên tục, duy trì nhịp luyện thi ổn định để cải thiện phản xạ và nâng cao band score.
                                </Paragraph>

                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                                    <Tag color="blue" style={{ borderRadius: 999, padding: '4px 10px' }}>
                                        {profile.role || 'Student'}
                                    </Tag>
                                    <Tag color={profile.isActive ? 'success' : 'default'} style={{ borderRadius: 999, padding: '4px 10px' }}>
                                        {profile.isActive ? 'Tài khoản hoạt động' : 'Tài khoản tạm khóa'}
                                    </Tag>
                                </div>

                                <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                                    <Text style={{ color: '#475569' }}>
                                        <MailOutlined style={{ marginRight: 8, color: '#2563eb' }} />
                                        {profile.email}
                                    </Text>
                                    <Text style={{ color: '#475569' }}>
                                        <SafetyCertificateOutlined style={{ marginRight: 8, color: '#16a34a' }} />
                                        Tham gia từ {formatDateTimeToMinute(profile.createdAt) || 'N/A'}
                                    </Text>
                                </div>
                            </div>
                        </div>
                    </Col>

                    <Col xs={24} xl={10}>
                        <Card
                            bordered={false}
                            style={{
                                borderRadius: 24,
                                background: 'rgba(255,255,255,0.82)',
                                boxShadow: '0 16px 36px rgba(15, 23, 42, 0.08)',
                            }}
                            styles={{ body: { padding: 24 } }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 14 }}>
                                <div>
                                    <Text style={{ color: '#64748b', display: 'block', marginBottom: 6 }}>Chuỗi học tập</Text>
                                    <Title level={3} style={{ margin: 0 }}>{`🔥 ${streak} ngày liên tiếp`}</Title>
                                </div>
                                <div
                                    style={{
                                        minWidth: 90,
                                        textAlign: 'center',
                                        padding: '10px 14px',
                                        borderRadius: 18,
                                        background: 'linear-gradient(135deg, #ea580c 0%, #f97316 100%)',
                                        color: '#fff',
                                        boxShadow: '0 14px 28px rgba(234, 88, 12, 0.22)',
                                    }}
                                >
                                    <div style={{ fontSize: 12, opacity: 0.9 }}>Kỷ lục</div>
                                    <div style={{ fontSize: 22, fontWeight: 800 }}>{longestStreak}d</div>
                                </div>
                            </div>

                            <Text style={{ color: '#475569', fontSize: 14, display: 'block', marginTop: 8 }}>
                                Duy trì thói quen luyện đề mỗi ngày để cải thiện phản xạ và nâng band score đều đặn.
                            </Text>

                            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 18 }}>
                                <Button type="primary" size="large" onClick={() => onNavigate('/app/practice')}>
                                    Vào luyện ngay
                                </Button>
                                <Button size="large" onClick={() => onNavigate('/app/my-exams')}>
                                    Xem bài thi của tôi
                                </Button>
                            </div>
                        </Card>
                    </Col>
                </Row>
            </div>
        </motion.div>
    );
};
