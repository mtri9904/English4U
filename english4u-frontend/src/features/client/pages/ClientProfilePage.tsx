import { useEffect } from 'react';
import {
    Avatar,
    Button,
    Card,
    Col,
    Empty,
    Form,
    Input,
    Progress,
    Row,
    Select,
    Spin,
    Tag,
    Typography,
    Upload,
    message,
} from 'antd';
import {
    ArrowRightOutlined,
    CameraOutlined,
    CheckCircleOutlined,
    FireOutlined,
    LockOutlined,
    MailOutlined,
    PhoneOutlined,
    SafetyCertificateOutlined,
    StarOutlined,
    ThunderboltOutlined,
    TrophyOutlined,
    UserOutlined,
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
    useChangePasswordMutation,
    useUpdateProfileMutation,
    useUserProfileQuery,
} from '@/features/admin/api/user.api';
import { getSkillLabel } from '@/features/client/lib/sessionRouting';
import { uploadToCloudinary } from '@/shared/lib/cloudinary';
import { formatDateTimeToMinute } from '@/shared/lib/dateTime';

const { Title, Text, Paragraph } = Typography;

const fadeUp = (delay = 0) => ({
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.35, delay },
});

const getStreakSummary = (streak: number) => {
    if (streak >= 14) {
        return {
            title: `🔥 Chuỗi ${streak} ngày`,
            description: 'Phong độ rất tốt. Chỉ cần giữ nhịp đều mỗi ngày là level sẽ lên rất nhanh.',
            accent: '#f97316',
            background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
        };
    }

    if (streak >= 7) {
        return {
            title: `🔥 Chuỗi ${streak} ngày`,
            description: 'Bạn đã vào guồng học tập ổn định. Cố giữ thêm vài ngày để mở rộng streak.',
            accent: '#ea580c',
            background: 'linear-gradient(135deg, #fff7ed 0%, #fffbeb 100%)',
        };
    }

    if (streak >= 1) {
        return {
            title: `🔥 Chuỗi ${streak} ngày`,
            description: 'Hôm nay chỉ cần hoàn thành thêm ít nhất 1 bài là chuỗi sẽ tiếp tục tăng.',
            accent: '#2563eb',
            background: 'linear-gradient(135deg, #eff6ff 0%, #eef2ff 100%)',
        };
    }

    return {
        title: '🔥 Streak: 0 ngày',
        description: 'Hãy bắt đầu luyện tập và hoàn thành ít nhất 1 bài để mở chuỗi ngày học.',
        accent: '#4f46e5',
        background: 'linear-gradient(135deg, #eef2ff 0%, #e0f2fe 100%)',
    };
};

const formatPracticeMinutes = (minutes: number) => {
    if (minutes <= 0) {
        return '0 phút';
    }

    if (minutes < 60) {
        return `${minutes} phút`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0
        ? `${hours} giờ ${remainingMinutes} phút`
        : `${hours} giờ`;
};

const getSkillTone = (skillType: string) => {
    const normalized = skillType.trim().toUpperCase();

    switch (normalized) {
        case 'READING':
            return { color: '#137dc5', background: '#eff6ff' };
        case 'LISTENING':
            return { color: '#7c3aed', background: '#f5f3ff' };
        case 'WRITING':
            return { color: '#d97706', background: '#fff7ed' };
        case 'SPEAKING':
            return { color: '#16a34a', background: '#f0fdf4' };
        default:
            return { color: '#475569', background: '#f8fafc' };
    }
};

const PROFILE_GOAL_OPTIONS = [
    {
        label: 'Vai trò học tập',
        options: [
            { label: 'Học sinh THPT', value: 'Học sinh THPT' },
            { label: 'Sinh viên', value: 'Sinh viên' },
            { label: 'Người đi làm', value: 'Người đi làm' },
            { label: 'Tự học IELTS', value: 'Tự học IELTS' },
        ],
    },
    {
        label: 'Mục tiêu band',
        options: [
            { label: 'Mục tiêu band 5.5', value: 'Mục tiêu band 5.5' },
            { label: 'Mục tiêu band 6.0', value: 'Mục tiêu band 6.0' },
            { label: 'Mục tiêu band 6.5', value: 'Mục tiêu band 6.5' },
            { label: 'Mục tiêu band 7.0', value: 'Mục tiêu band 7.0' },
            { label: 'Mục tiêu band 7.5+', value: 'Mục tiêu band 7.5+' },
        ],
    },
];

export const ClientProfilePage = () => {
    const navigate = useNavigate();
    const { data: profile, isLoading } = useUserProfileQuery();
    const updateProfileMutation = useUpdateProfileMutation();
    const changePasswordMutation = useChangePasswordMutation();
    const [profileForm] = Form.useForm();
    const [passwordForm] = Form.useForm();

    useEffect(() => {
        if (!profile) {
            return;
        }

        profileForm.setFieldsValue({
            displayName: profile.displayName,
            email: profile.email,
            phone: profile.phone,
            position: profile.position,
        });
    }, [profile, profileForm]);

    const handleUpdateProfile = async (values: {
        displayName: string;
        phone?: string;
        position?: string;
    }) => {
        try {
            await updateProfileMutation.mutateAsync({
                displayName: values.displayName,
                avatarUrl: profile?.avatarUrl || undefined,
                phone: values.phone,
                department: profile?.department || undefined,
                position: values.position,
                notes: profile?.notes || undefined,
            });
            message.success('Đã lưu cập nhật hồ sơ.');
        } catch (error: any) {
            message.error(error?.response?.data?.message || 'Không thể cập nhật hồ sơ.');
        }
    };

    const handleAvatarUpload = async (file: File) => {
        const hide = message.loading('Đang tải ảnh đại diện...', 0);

        try {
            const avatarUrl = await uploadToCloudinary(file, 'image');
            await updateProfileMutation.mutateAsync({
                displayName: profile?.displayName || '',
                avatarUrl,
                phone: profile?.phone || undefined,
                department: profile?.department || undefined,
                position: profile?.position || undefined,
                notes: profile?.notes || undefined,
            });
            message.success('Ảnh đại diện đã được cập nhật.');
        } catch (error: any) {
            message.error(error?.message || 'Không thể tải ảnh lên.');
        } finally {
            hide();
        }

        return false;
    };

    const handleChangePassword = async (values: { oldPassword: string; newPassword: string }) => {
        try {
            await changePasswordMutation.mutateAsync(values);
            passwordForm.resetFields();
            message.success('Đổi mật khẩu thành công.');
        } catch (error: any) {
            message.error(error?.response?.data?.message || 'Không thể đổi mật khẩu.');
        }
    };

    if (isLoading) {
        return (
            <div style={{ display: 'grid', placeItems: 'center', minHeight: 360 }}>
                <Spin size="large" />
            </div>
        );
    }

    const streak = profile?.gamification.dailyStreakCount ?? 0;
    const streakSummary = getStreakSummary(streak);
    const currentXp = profile?.gamification.experiencePoints ?? 0;
    const currentLevel = profile?.gamification.currentLevel ?? 1;
    const nextLevelXp = profile?.gamification.nextLevelExperience ?? 100;
    const currentLevelStartXp = profile?.gamification.currentLevelStartExperience ?? 0;
    const levelProgressPercent = profile?.gamification.levelProgressPercent ?? 0;
    const xpInsideLevel = Math.max(0, currentXp - currentLevelStartXp);
    const xpSpan = Math.max(1, nextLevelXp - currentLevelStartXp);

    const statCards = [
        {
            key: 'xp',
            label: 'Tổng XP',
            value: currentXp.toLocaleString('vi-VN'),
            detail: `Lv.${currentLevel}`,
            icon: <TrophyOutlined style={{ color: '#eab308' }} />,
            background: 'linear-gradient(135deg, #fff7ed 0%, #fef3c7 100%)',
        },
        {
            key: 'uniqueExams',
            label: 'Đề đã chinh phục',
            value: `${profile?.learning.uniqueExamCompletedCount ?? 0}`,
            detail: `${profile?.learning.completedSessionCount ?? 0} lượt hoàn thành`,
            icon: <CheckCircleOutlined style={{ color: '#2563eb' }} />,
            background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
        },
        {
            key: 'avgBand',
            label: 'Band trung bình',
            value: profile?.learning.averageBandScore != null ? profile.learning.averageBandScore.toFixed(1) : '—',
            detail: profile?.learning.bestBandScore != null ? `Best ${profile.learning.bestBandScore.toFixed(1)}` : 'Chưa có điểm',
            icon: <StarOutlined style={{ color: '#7c3aed' }} />,
            background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
        },
        {
            key: 'time',
            label: 'Thời gian luyện',
            value: formatPracticeMinutes(profile?.learning.totalPracticeMinutes ?? 0),
            detail: formatDateTimeToMinute(profile?.gamification.lastActivityAt) || 'Chưa có hoạt động',
            icon: <ThunderboltOutlined style={{ color: '#16a34a' }} />,
            background: 'linear-gradient(135deg, #ecfdf5 0%, #dcfce7 100%)',
        },
    ];

    return (
        <div style={{ maxWidth: 1240, margin: '0 auto' }}>
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
                                <Upload accept="image/*" showUploadList={false} beforeUpload={handleAvatarUpload}>
                                    <div style={{ position: 'relative', cursor: 'pointer' }}>
                                        <Avatar
                                            size={110}
                                            icon={<UserOutlined />}
                                            src={profile?.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile?.id}`}
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
                                        {profile?.displayName || 'Học viên English4U'}
                                    </Title>
                                    <Paragraph style={{ color: '#475569', marginBottom: 12, maxWidth: 560 }}>
                                        Theo dõi chuỗi ngày học, tích lũy kinh nghiệm qua từng đề và giữ nhịp luyện tập ổn định để lên level nhanh hơn.
                                    </Paragraph>

                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                                        <Tag color="blue" style={{ borderRadius: 999, padding: '4px 10px' }}>
                                            {profile?.role || 'Student'}
                                        </Tag>
                                        <Tag color={profile?.isActive ? 'success' : 'default'} style={{ borderRadius: 999, padding: '4px 10px' }}>
                                            {profile?.isActive ? 'Tài khoản hoạt động' : 'Tài khoản tạm khóa'}
                                        </Tag>
                                        <Tag color="gold" style={{ borderRadius: 999, padding: '4px 10px' }}>
                                            {`Lv.${currentLevel}`}
                                        </Tag>
                                    </div>

                                    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                                        <Text style={{ color: '#475569' }}>
                                            <MailOutlined style={{ marginRight: 8, color: '#2563eb' }} />
                                            {profile?.email}
                                        </Text>
                                        <Text style={{ color: '#475569' }}>
                                            <SafetyCertificateOutlined style={{ marginRight: 8, color: '#16a34a' }} />
                                            Tham gia từ {formatDateTimeToMinute(profile?.createdAt) || 'N/A'}
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
                                        <Text style={{ color: '#64748b', display: 'block', marginBottom: 6 }}>Tiến trình lên cấp</Text>
                                        <Title level={3} style={{ margin: 0 }}>{`Lv.${currentLevel}`}</Title>
                                    </div>
                                    <div
                                        style={{
                                            minWidth: 112,
                                            textAlign: 'center',
                                            padding: '10px 14px',
                                            borderRadius: 18,
                                            background: 'linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)',
                                            color: '#fff',
                                            boxShadow: '0 14px 28px rgba(37, 99, 235, 0.22)',
                                        }}
                                    >
                                        <div style={{ fontSize: 12, opacity: 0.9 }}>XP hiện tại</div>
                                        <div style={{ fontSize: 24, fontWeight: 800 }}>{currentXp}</div>
                                    </div>
                                </div>

                                <Progress
                                    percent={levelProgressPercent}
                                    showInfo={false}
                                    strokeColor={{ '0%': '#2563eb', '100%': '#06b6d4' }}
                                    trailColor="#dbeafe"
                                    strokeLinecap="round"
                                />

                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 10, color: '#475569', fontSize: 13 }}>
                                    <span>{`${xpInsideLevel}/${xpSpan} XP trong level hiện tại`}</span>
                                    <span>{`Còn ${profile?.gamification.experienceToNextLevel ?? 0} XP để lên level`}</span>
                                </div>

                                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 18 }}>
                                    <Button type="primary" size="large" onClick={() => navigate('/app/practice')}>
                                        Vào luyện ngay
                                    </Button>
                                    <Button size="large" onClick={() => navigate('/app/my-exams')}>
                                        Xem bài thi của tôi
                                    </Button>
                                </div>
                            </Card>
                        </Col>
                    </Row>
                </div>
            </motion.div>

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

            <Row gutter={[24, 24]}>
                <Col xs={24} xl={14}>
                    <motion.div {...fadeUp(0.14)}>
                        <Card
                            bordered={false}
                            style={{ borderRadius: 24, marginBottom: 24 }}
                            styles={{ body: { padding: 28 } }}
                        >
                            <div style={{ marginBottom: 22 }}>
                                <Title level={4} style={{ margin: 0 }}>Thông tin cá nhân</Title>
                                <Text style={{ color: '#64748b' }}>Cập nhật các thông tin cơ bản mà học viên nhìn thấy trên hệ thống.</Text>
                            </div>

                            <Form form={profileForm} layout="vertical" onFinish={handleUpdateProfile}>
                                <Row gutter={16}>
                                    <Col xs={24} md={12}>
                                        <Form.Item
                                            name="displayName"
                                            label="Tên hiển thị"
                                            rules={[{ required: true, message: 'Vui lòng nhập tên hiển thị.' }]}
                                        >
                                            <Input prefix={<UserOutlined style={{ color: '#94a3b8' }} />} placeholder="Nhập tên hiển thị" />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={12}>
                                        <Form.Item name="email" label="Email">
                                            <Input disabled prefix={<MailOutlined style={{ color: '#94a3b8' }} />} />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={12}>
                                        <Form.Item
                                            name="phone"
                                            label="Số điện thoại"
                                            rules={[{ pattern: /^$|^[0-9+\-\s]{9,15}$/, message: 'Số điện thoại không hợp lệ.' }]}
                                        >
                                            <Input prefix={<PhoneOutlined style={{ color: '#94a3b8' }} />} placeholder="Nhập số điện thoại" />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={12}>
                                        <Form.Item name="position" label="Mục tiêu / Vai trò">
                                            <Select
                                                allowClear
                                                showSearch
                                                placeholder="Chọn mục tiêu hoặc vai trò phù hợp"
                                                optionFilterProp="label"
                                                options={PROFILE_GOAL_OPTIONS}
                                            />
                                        </Form.Item>
                                    </Col>
                                </Row>

                                <Button
                                    type="primary"
                                    htmlType="submit"
                                    loading={updateProfileMutation.isPending}
                                    style={{ height: 42, paddingInline: 22, borderRadius: 12 }}
                                >
                                    Lưu thay đổi
                                </Button>
                            </Form>
                        </Card>
                    </motion.div>

                    <motion.div {...fadeUp(0.18)}>
                        <Card
                            bordered={false}
                            style={{ borderRadius: 24 }}
                            styles={{ body: { padding: 28 } }}
                        >
                            <div style={{ marginBottom: 22 }}>
                                <Title level={4} style={{ margin: 0 }}>Bảo mật tài khoản</Title>
                                <Text style={{ color: '#64748b' }}>Đổi mật khẩu để bảo vệ tài khoản học tập của bạn.</Text>
                            </div>

                            <Form form={passwordForm} layout="vertical" onFinish={handleChangePassword}>
                                <Form.Item
                                    name="oldPassword"
                                    label="Mật khẩu hiện tại"
                                    rules={[{ required: true, message: 'Vui lòng nhập mật khẩu hiện tại.' }]}
                                >
                                    <Input.Password prefix={<LockOutlined style={{ color: '#94a3b8' }} />} />
                                </Form.Item>

                                <Row gutter={16}>
                                    <Col xs={24} md={12}>
                                        <Form.Item
                                            name="newPassword"
                                            label="Mật khẩu mới"
                                            rules={[{ required: true, message: 'Vui lòng nhập mật khẩu mới.' }]}
                                        >
                                            <Input.Password prefix={<LockOutlined style={{ color: '#94a3b8' }} />} />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={12}>
                                        <Form.Item
                                            name="confirmPassword"
                                            label="Xác nhận mật khẩu"
                                            dependencies={['newPassword']}
                                            rules={[
                                                { required: true, message: 'Vui lòng xác nhận mật khẩu mới.' },
                                                ({ getFieldValue }) => ({
                                                    validator(_, value) {
                                                        if (!value || getFieldValue('newPassword') === value) {
                                                            return Promise.resolve();
                                                        }

                                                        return Promise.reject(new Error('Mật khẩu xác nhận không khớp.'));
                                                    },
                                                }),
                                            ]}
                                        >
                                            <Input.Password prefix={<LockOutlined style={{ color: '#94a3b8' }} />} />
                                        </Form.Item>
                                    </Col>
                                </Row>

                                <Button
                                    htmlType="submit"
                                    loading={changePasswordMutation.isPending}
                                    style={{ height: 42, paddingInline: 22, borderRadius: 12 }}
                                >
                                    Đổi mật khẩu
                                </Button>
                            </Form>
                        </Card>
                    </motion.div>
                </Col>

                <Col xs={24} xl={10}>
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
                                        {profile?.gamification.longestStreakCount ?? 0}
                                    </div>
                                </div>
                                <div style={{ padding: 16, borderRadius: 18, background: 'rgba(255,255,255,0.7)' }}>
                                    <Text style={{ color: '#64748b', display: 'block', marginBottom: 4 }}>Hoạt động gần nhất</Text>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                                        {formatDateTimeToMinute(profile?.gamification.lastActivityAt) || 'Chưa có'}
                                    </div>
                                </div>
                            </div>
                        </Card>
                    </motion.div>

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
                                <Button type="link" icon={<ArrowRightOutlined />} onClick={() => navigate('/app/my-exams')}>
                                    Xem tất cả
                                </Button>
                            </div>

                            {(profile?.recentExamActivities.length ?? 0) === 0 ? (
                                <Empty
                                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                                    description="Bạn chưa hoàn thành đề nào để hiển thị lịch sử."
                                />
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {profile?.recentExamActivities.map((item) => {
                                        const tone = getSkillTone(item.skillType);

                                        return (
                                            <button
                                                key={item.sessionId}
                                                type="button"
                                                onClick={() => navigate(`/app/sessions/${item.sessionId}/submit`)}
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
                </Col>
            </Row>
        </div>
    );
};
