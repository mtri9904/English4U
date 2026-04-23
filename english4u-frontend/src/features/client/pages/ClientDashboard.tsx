import React from 'react';
import { Row, Col, Card, Typography, Progress, Tag, Avatar, Button, Statistic } from 'antd';
import {
    ReadOutlined,
    TrophyOutlined,
    FireOutlined,
    RightOutlined,
    ClockCircleOutlined,
    BookOutlined,
    BarChartOutlined,
    ThunderboltOutlined,
    CheckCircleOutlined,
    StarFilled,
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useUserProfileQuery } from '@/features/admin/api/user.api';

const { Title, Text, Paragraph } = Typography;

const fadeUp = (delay = 0) => ({
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, delay },
});

const MOCK_RECENT_EXAMS = [
    { id: 1, title: 'IELTS Mock Test - Reading', type: 'Reading', score: 7.5, total: 9, date: '03/03/2026', color: '#137dc5' },
    { id: 2, title: 'IELTS Mock Test - Listening', type: 'Listening', score: 6.5, total: 9, date: '02/03/2026', color: '#7c3aed' },
    { id: 3, title: 'IELTS Mock Test - Writing', type: 'Writing', score: 6.0, total: 9, date: '01/03/2026', color: '#d97706' },
];

const SKILL_DATA = [
    { name: 'Reading', progress: 72, color: '#137dc5', icon: <ReadOutlined /> },
    { name: 'Listening', progress: 58, color: '#7c3aed', icon: <BookOutlined /> },
    { name: 'Writing', progress: 45, color: '#d97706', icon: <BarChartOutlined /> },
    { name: 'Speaking', progress: 30, color: '#16a34a', icon: <ThunderboltOutlined /> },
];

const QUICK_ACTIONS = [
    {
        title: 'Reading',
        desc: 'Đọc hiểu đoạn văn IELTS',
        icon: <ReadOutlined style={{ fontSize: 24 }} />,
        gradient: 'linear-gradient(135deg, #137dc5, #0ea5e9)',
        path: '/app/practice?skill=READING',
    },
    {
        title: 'Listening',
        desc: 'Nghe và trả lời câu hỏi',
        icon: <BookOutlined style={{ fontSize: 24 }} />,
        gradient: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
        path: '/app/practice?skill=LISTENING',
    },
    {
        title: 'Writing',
        desc: 'Task 1 và Task 2 mô phỏng thi thật',
        icon: <BarChartOutlined style={{ fontSize: 24 }} />,
        gradient: 'linear-gradient(135deg, #d97706, #f59e0b)',
        path: '/app/practice?skill=WRITING',
    },
    {
        title: 'Speaking',
        desc: 'Part 1, Part 2 và Part 3 theo đề thật',
        icon: <ThunderboltOutlined style={{ fontSize: 24 }} />,
        gradient: 'linear-gradient(135deg, #16a34a, #22c55e)',
        path: '/app/practice?skill=SPEAKING',
    },
];

export const ClientDashboard: React.FC = () => {
    const navigate = useNavigate();
    const { data: profile } = useUserProfileQuery();

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Chào buổi sáng';
        if (hour < 18) return 'Chào buổi chiều';
        return 'Chào buổi tối';
    };

    return (
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <motion.div {...fadeUp(0)}>
                <div style={{
                    background: 'linear-gradient(135deg, #e0f2fe 0%, #ede9fe 50%, #fce7f3 100%)',
                    borderRadius: 20,
                    padding: '32px 36px',
                    marginBottom: 28,
                    position: 'relative',
                    overflow: 'hidden',
                }}>
                    <div style={{
                        position: 'absolute',
                        top: -40,
                        right: -20,
                        width: 180,
                        height: 180,
                        borderRadius: '50%',
                        background: 'rgba(124, 58, 237, 0.08)',
                    }} />
                    <div style={{
                        position: 'absolute',
                        bottom: -30,
                        right: 100,
                        width: 120,
                        height: 120,
                        borderRadius: '50%',
                        background: 'rgba(19, 125, 197, 0.06)',
                    }} />

                    <Row align="middle" gutter={24}>
                        <Col flex="auto">
                            <Text type="secondary" style={{ fontSize: 14, display: 'block', marginBottom: 4 }}>
                                {getGreeting()} 👋
                            </Text>
                            <Title level={3} style={{ margin: 0, fontWeight: 700 }}>
                                {profile?.displayName || 'Học viên'}
                            </Title>
                            <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, maxWidth: 500, fontSize: 14 }}>
                                Chọn đúng kỹ năng cần luyện, làm đề đều đặn và theo dõi band mục tiêu của bạn rõ ràng hơn sau từng lần thi thử.
                            </Paragraph>
                        </Col>
                        <Col>
                            <div style={{
                                display: 'flex',
                                gap: 16,
                                alignItems: 'center',
                            }}>
                                <div style={{
                                    background: '#fff',
                                    borderRadius: 16,
                                    padding: '14px 20px',
                                    textAlign: 'center',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                                }}>
                                    <FireOutlined style={{ fontSize: 24, color: '#f97316' }} />
                                    <div style={{ fontWeight: 700, fontSize: 20, marginTop: 4 }}>0</div>
                                    <Text type="secondary" style={{ fontSize: 11 }}>Streak</Text>
                                </div>
                                <div style={{
                                    background: '#fff',
                                    borderRadius: 16,
                                    padding: '14px 20px',
                                    textAlign: 'center',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                                }}>
                                    <TrophyOutlined style={{ fontSize: 24, color: '#eab308' }} />
                                    <div style={{ fontWeight: 700, fontSize: 20, marginTop: 4 }}>0</div>
                                    <Text type="secondary" style={{ fontSize: 11 }}>Điểm XP</Text>
                                </div>
                            </div>
                        </Col>
                    </Row>
                </div>
            </motion.div>

            <motion.div {...fadeUp(0.1)}>
                <Title level={5} style={{ marginBottom: 16, fontWeight: 700 }}>
                    <ThunderboltOutlined style={{ color: '#7c3aed', marginRight: 8 }} />
                    Bắt đầu nhanh
                </Title>
                <Row gutter={[16, 16]} style={{ marginBottom: 28 }}>
                    {QUICK_ACTIONS.map((action, i) => (
                        <Col xs={12} sm={12} md={6} key={i}>
                            <motion.div
                                whileHover={{ y: -4, scale: 1.02 }}
                                whileTap={{ scale: 0.97 }}
                                transition={{ duration: 0.2 }}
                            >
                                <Card
                                    hoverable
                                    onClick={() => navigate(action.path)}
                                    style={{
                                        borderRadius: 16,
                                        border: 'none',
                                        overflow: 'hidden',
                                        cursor: 'pointer',
                                        height: '100%',
                                    }}
                                    styles={{ body: { padding: 20 } }}
                                >
                                    <div style={{
                                        width: 48,
                                        height: 48,
                                        borderRadius: 14,
                                        background: action.gradient,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: '#fff',
                                        marginBottom: 14,
                                    }}>
                                        {action.icon}
                                    </div>
                                    <Text strong style={{ display: 'block', fontSize: 14, marginBottom: 4 }}>
                                        {action.title}
                                    </Text>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        {action.desc}
                                    </Text>
                                </Card>
                            </motion.div>
                        </Col>
                    ))}
                </Row>
            </motion.div>

            <Row gutter={[24, 24]}>
                <Col xs={24} lg={14}>
                    <motion.div {...fadeUp(0.2)}>
                        <Card
                            title={
                                <span style={{ fontWeight: 700 }}>
                                    <BarChartOutlined style={{ color: '#137dc5', marginRight: 8 }} />
                                    Tiến trình kỹ năng
                                </span>
                            }
                            style={{ borderRadius: 16, marginBottom: 24 }}
                            styles={{ body: { padding: '20px 24px' } }}
                        >
                            <Row gutter={[24, 20]}>
                                {SKILL_DATA.map((skill, i) => (
                                    <Col span={12} key={i}>
                                        <div style={{
                                            padding: '16px',
                                            background: '#f8fafc',
                                            borderRadius: 14,
                                            border: '1px solid #f1f5f9',
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <div style={{
                                                        width: 28,
                                                        height: 28,
                                                        borderRadius: 8,
                                                        background: `${skill.color}15`,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        color: skill.color,
                                                        fontSize: 13,
                                                    }}>
                                                        {skill.icon}
                                                    </div>
                                                    <Text strong style={{ fontSize: 13 }}>{skill.name}</Text>
                                                </div>
                                                <Text type="secondary" style={{ fontSize: 12 }}>{skill.progress}%</Text>
                                            </div>
                                            <Progress
                                                percent={skill.progress}
                                                strokeColor={skill.color}
                                                trailColor="#e2e8f0"
                                                showInfo={false}
                                                size="small"
                                            />
                                        </div>
                                    </Col>
                                ))}
                            </Row>
                        </Card>
                    </motion.div>

                    <motion.div {...fadeUp(0.3)}>
                        <Card
                            title={
                                <span style={{ fontWeight: 700 }}>
                                    <ClockCircleOutlined style={{ color: '#7c3aed', marginRight: 8 }} />
                                    Bài thi gần đây
                                </span>
                            }
                            extra={<Button type="link" onClick={() => navigate('/app/my-exams')}>Xem tất cả</Button>}
                            style={{ borderRadius: 16 }}
                            styles={{ body: { padding: '8px 24px' } }}
                        >
                            {MOCK_RECENT_EXAMS.map((exam, i) => (
                                <div
                                    key={exam.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '16px 0',
                                        borderBottom: i < MOCK_RECENT_EXAMS.length - 1 ? '1px solid #f1f5f9' : 'none',
                                        cursor: 'pointer',
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                        <div style={{
                                            width: 40,
                                            height: 40,
                                            borderRadius: 12,
                                            background: `${exam.color}12`,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}>
                                            <CheckCircleOutlined style={{ color: exam.color, fontSize: 18 }} />
                                        </div>
                                        <div>
                                            <Text strong style={{ display: 'block', fontSize: 13 }}>{exam.title}</Text>
                                            <Text type="secondary" style={{ fontSize: 12 }}>{exam.date}</Text>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <Tag color={exam.color} style={{ borderRadius: 8, margin: 0, fontSize: 11 }}>{exam.type}</Tag>
                                        <Text strong style={{ color: exam.color, fontSize: 14 }}>
                                            {exam.score}/{exam.total}
                                        </Text>
                                        <RightOutlined style={{ color: '#cbd5e1', fontSize: 12 }} />
                                    </div>
                                </div>
                            ))}
                        </Card>
                    </motion.div>
                </Col>

                <Col xs={24} lg={10}>
                    <motion.div {...fadeUp(0.25)}>
                        <Card
                            style={{
                                borderRadius: 16,
                                marginBottom: 24,
                                background: 'linear-gradient(135deg, #137dc5, #0c4a6e)',
                                border: 'none',
                            }}
                            styles={{ body: { padding: 28 } }}
                        >
                            <Title level={5} style={{ color: '#fff', margin: 0, fontWeight: 700, marginBottom: 8 }}>
                                🎯 Mục tiêu tuần này
                            </Title>
                            <Paragraph style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, marginBottom: 20 }}>
                                Hoàn thành 5 bài luyện tập để nhận thêm điểm XP
                            </Paragraph>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>0 / 5 bài</Text>
                                <Text style={{ color: '#fbbf24', fontSize: 13, fontWeight: 600 }}>0%</Text>
                            </div>
                            <Progress percent={0} strokeColor="#fbbf24" trailColor="rgba(255,255,255,0.15)" showInfo={false} />
                        </Card>
                    </motion.div>

                    <motion.div {...fadeUp(0.3)}>
                        <Card
                            title={
                                <span style={{ fontWeight: 700 }}>
                                    <TrophyOutlined style={{ color: '#eab308', marginRight: 8 }} />
                                    Bảng thành tích
                                </span>
                            }
                            style={{ borderRadius: 16, marginBottom: 24 }}
                            styles={{ body: { padding: '16px 24px' } }}
                        >
                            <Row gutter={[16, 16]}>
                                <Col span={12}>
                                    <Statistic
                                        title={<Text type="secondary" style={{ fontSize: 12 }}>Bài đã làm</Text>}
                                        value={0}
                                        prefix={<ReadOutlined />}
                                        valueStyle={{ fontSize: 24, fontWeight: 700, color: '#137dc5' }}
                                    />
                                </Col>
                                <Col span={12}>
                                    <Statistic
                                        title={<Text type="secondary" style={{ fontSize: 12 }}>Điểm trung bình</Text>}
                                        value={0}
                                        suffix="/9"
                                        prefix={<StarFilled />}
                                        valueStyle={{ fontSize: 24, fontWeight: 700, color: '#7c3aed' }}
                                    />
                                </Col>
                                <Col span={12}>
                                    <Statistic
                                        title={<Text type="secondary" style={{ fontSize: 12 }}>Giờ luyện thi</Text>}
                                        value={0}
                                        prefix={<ClockCircleOutlined />}
                                        valueStyle={{ fontSize: 24, fontWeight: 700, color: '#d97706' }}
                                    />
                                </Col>
                                <Col span={12}>
                                    <Statistic
                                        title={<Text type="secondary" style={{ fontSize: 12 }}>Xếp hạng</Text>}
                                        value="--"
                                        prefix={<TrophyOutlined />}
                                        valueStyle={{ fontSize: 24, fontWeight: 700, color: '#16a34a' }}
                                    />
                                </Col>
                            </Row>
                        </Card>
                    </motion.div>

                    <motion.div {...fadeUp(0.35)}>
                        <Card
                            style={{ borderRadius: 16 }}
                            styles={{ body: { padding: '20px 24px' } }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                                <Avatar
                                    size={44}
                                    src={profile?.avatarUrl}
                                    style={{ backgroundColor: '#137dc5' }}
                                >
                                    {profile?.displayName?.charAt(0)?.toUpperCase() || 'U'}
                                </Avatar>
                                <div>
                                    <Text strong style={{ display: 'block', fontSize: 14 }}>{profile?.displayName || 'Học viên'}</Text>
                                    <Text type="secondary" style={{ fontSize: 12 }}>{profile?.email}</Text>
                                </div>
                            </div>
                            <Button
                                type="default"
                                block
                                style={{ borderRadius: 10, height: 38 }}
                                onClick={() => navigate('/app/profile')}
                            >
                                Xem hồ sơ
                            </Button>
                        </Card>
                    </motion.div>
                </Col>
            </Row>
        </div>
    );
};
