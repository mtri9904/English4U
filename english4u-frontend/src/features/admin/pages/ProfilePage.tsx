import React, { useEffect } from 'react';
import { Card, Avatar, Button, Tabs, Form, Input, Row, Col, Divider, message, Tag, Typography, Spin, Upload } from 'antd';
import {
    UserOutlined,
    LockOutlined,
    MailOutlined,
    CameraOutlined,
    SafetyCertificateOutlined,
    KeyOutlined,
    PhoneOutlined,
    BankOutlined,
    IdcardOutlined
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import { useUserProfileQuery, useUpdateProfileMutation, useChangePasswordMutation } from '../api/user.api';
import { uploadToCloudinary } from '@/shared/lib/cloudinary';

const { Title, Text } = Typography;

export const ProfilePage: React.FC = () => {
    const { data: profile, isLoading } = useUserProfileQuery();
    const updateProfileMutation = useUpdateProfileMutation();
    const changePasswordMutation = useChangePasswordMutation();
    const [form] = Form.useForm();
    const [passwordForm] = Form.useForm();

    useEffect(() => {
        if (profile) {
            form.setFieldsValue({
                displayName: profile.displayName,
                email: profile.email,
                phone: profile.phone,
                department: profile.department,
                position: profile.position,
                notes: profile.notes,
            });
        }
    }, [profile, form]);

    const handleUpdateProfile = async (values: any) => {
        try {
            await updateProfileMutation.mutateAsync({
                displayName: values.displayName,
                avatarUrl: profile?.avatarUrl || undefined,
                phone: values.phone,
                department: values.department,
                position: values.position,
                notes: values.notes
            });
            message.success('Cập nhật thông tin tài khoản thành công!');
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Không thể cập nhật hồ sơ');
        }
    };

    const handleAvatarUpload = async (file: File) => {
        const hide = message.loading('Đang tải ảnh lên...', 0);
        try {
            const url = await uploadToCloudinary(file, 'image');
            await updateProfileMutation.mutateAsync({
                displayName: profile?.displayName || '',
                avatarUrl: url
            });
            message.success('Cập nhật ảnh đại diện thành công!');
        } catch (error: any) {
            message.error('Lỗi khi tải ảnh lên: ' + (error.message || 'Unknown error'));
        } finally {
            hide();
        }
        return false;
    };

    const handleChangePassword = async (values: any) => {
        try {
            await changePasswordMutation.mutateAsync({
                oldPassword: values.oldPassword,
                newPassword: values.newPassword
            });
            message.success('Đổi mật khẩu thành công!');
            passwordForm.resetFields();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Mật khẩu cũ không chính xác');
        }
    };

    if (isLoading) {
        return <div style={{ textAlign: 'center', padding: '100px' }}><Spin size="large" /></div>;
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
        >
            <div style={{ marginBottom: 24 }}>
                <Title level={2} style={{ margin: 0, fontWeight: 700 }}>Thông tin cá nhân</Title>
                <Text type="secondary">Quản lý thông tin hồ sơ và mật khẩu tài khoản của bạn</Text>
            </div>

            <Row gutter={[24, 24]}>
                {/* Left Column: Avatar & Info Summary */}
                <Col xs={24} lg={8}>
                    <Card style={{ borderRadius: 16, textAlign: 'center', height: '100%' }} bodyStyle={{ padding: 40 }}>
                        <div style={{ position: 'relative', display: 'inline-block', marginBottom: 24 }}>
                            <Upload
                                accept="image/*"
                                showUploadList={false}
                                beforeUpload={handleAvatarUpload}
                            >
                                <div style={{ position: 'relative', cursor: 'pointer' }}>
                                    <Avatar
                                        size={120}
                                        icon={<UserOutlined />}
                                        src={profile?.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile?.id}`}
                                        style={{ border: '4px solid #f0f9ff', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                    />
                                    <div style={{
                                        position: 'absolute',
                                        bottom: 0,
                                        right: 0,
                                        background: '#fff',
                                        width: 32,
                                        height: 32,
                                        borderRadius: '50%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                                    }}>
                                        <CameraOutlined style={{ color: '#0ea5e9' }} />
                                    </div>
                                </div>
                            </Upload>
                        </div>

                        <Title level={4} style={{ marginBottom: 4 }}>{profile?.displayName || 'N/A'}</Title>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                            <Tag color="cyan" icon={<SafetyCertificateOutlined />} style={{ borderRadius: 12, padding: '2px 10px', margin: 0 }}>
                                Vai trò: {profile?.role || 'Thành viên'}
                            </Tag>
                            <Tag color={profile?.isActive ? 'success' : 'error'} style={{ borderRadius: 12, padding: '2px 10px', margin: 0 }}>
                                {profile?.isActive ? 'Hoạt động' : 'Đã khóa'}
                            </Tag>
                        </div>

                        <Divider style={{ margin: '24px 0' }} />

                        <div style={{ textAlign: 'left' }}>
                            <div style={{ marginBottom: 16 }}>
                                <Text strong style={{ display: 'block', color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase' }}>Email</Text>
                                <Text style={{ color: '#334155' }}>{profile?.email || 'N/A'}</Text>
                            </div>
                            <div style={{ marginBottom: 16 }}>
                                <Text strong style={{ display: 'block', color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase' }}>Số điện thoại</Text>
                                <Text style={{ color: '#334155' }}>{profile?.phone || 'Chưa cập nhật'}</Text>
                            </div>
                            <div style={{ marginBottom: 16 }}>
                                <Text strong style={{ display: 'block', color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase' }}>Ngày tham gia</Text>
                                <Text style={{ color: '#334155' }}>{profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString('vi-VN') : 'N/A'}</Text>
                            </div>
                            <div style={{ marginBottom: 16 }}>
                                <Text strong style={{ display: 'block', color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase' }}>Lần đăng nhập cuối</Text>
                                <Text style={{ color: '#334155' }}>{profile?.lastLoginAt ? new Date(profile.lastLoginAt).toLocaleString('vi-VN') : 'N/A'}</Text>
                            </div>
                        </div>
                    </Card>
                </Col>

                {/* Right Column: Settings Tabs */}
                <Col xs={24} lg={16}>
                    <Card style={{ borderRadius: 16, height: '100%' }}>
                        <Tabs
                            defaultActiveKey="1"
                            items={[
                                {
                                    key: '1',
                                    label: (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <UserOutlined /> Hồ sơ cá nhân
                                        </span>
                                    ),
                                    children: (
                                        <div style={{ paddingTop: 12 }}>
                                            <Form
                                                form={form}
                                                layout="vertical"
                                                onFinish={handleUpdateProfile}
                                            >
                                                <Row gutter={16}>
                                                    <Col span={12}>
                                                        <Form.Item name="displayName" label="Tên hiển thị" rules={[{ required: true, message: 'Vui lòng nhập tên hiển thị!' }]}>
                                                            <Input placeholder="Nhập tên" prefix={<UserOutlined style={{ color: '#cbd5e1' }} />} />
                                                        </Form.Item>
                                                    </Col>
                                                    <Col span={12}>
                                                        <Form.Item name="email" label="Email">
                                                            <Input disabled prefix={<MailOutlined style={{ color: '#cbd5e1' }} />} />
                                                        </Form.Item>
                                                    </Col>
                                                    <Col span={12}>
                                                        <Form.Item name="phone" label="Số điện thoại" rules={[{ required: false, pattern: /^[0-9\-\+]{9,15}$/, message: 'Số điện thoại không hợp lệ' }]}>
                                                            <Input placeholder="Nhập số điện thoại" prefix={<PhoneOutlined style={{ color: '#cbd5e1' }} />} />
                                                        </Form.Item>
                                                    </Col>
                                                    <Col span={12}>
                                                        <Form.Item name="department" label="Phòng ban / Bộ phận">
                                                            <Input placeholder="Ví dụ: Đào tạo, Hành chính..." prefix={<BankOutlined style={{ color: '#cbd5e1' }} />} />
                                                        </Form.Item>
                                                    </Col>
                                                    <Col span={12}>
                                                        <Form.Item name="position" label="Chức vụ">
                                                            <Input placeholder="Ví dụ: Giảng viên, Quản trị viên..." prefix={<IdcardOutlined style={{ color: '#cbd5e1' }} />} />
                                                        </Form.Item>
                                                    </Col>
                                                    <Col span={24}>
                                                        <Form.Item name="notes" label="Ghi chú hệ thống nội bộ">
                                                            <Input.TextArea rows={4} placeholder="Nhập ghi chú hoặc thông tin bổ sung... (chỉ Admin mới thấy hoặc cập nhật được nếu cần phân quyền)" />
                                                        </Form.Item>
                                                    </Col>
                                                </Row>
                                                <Divider style={{ margin: '12px 0 24px' }} />
                                                <Button type="primary" htmlType="submit" loading={updateProfileMutation.isPending} style={{ borderRadius: 8, height: 40, padding: '0 24px' }}>
                                                    Lưu thay đổi
                                                </Button>
                                            </Form>
                                        </div>
                                    ),
                                },
                                {
                                    key: '2',
                                    label: (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <LockOutlined /> Mật khẩu & Bảo mật
                                        </span>
                                    ),
                                    children: (
                                        <div style={{ paddingTop: 12 }}>
                                            <Title level={5}>Đổi mật khẩu</Title>
                                            <Form
                                                form={passwordForm}
                                                layout="vertical"
                                                onFinish={handleChangePassword}
                                            >
                                                <Form.Item name="oldPassword" label="Mật khẩu hiện tại" rules={[{ required: true, message: 'Vui lòng nhập mật khẩu cũ!' }]}>
                                                    <Input.Password prefix={<KeyOutlined style={{ color: '#cbd5e1' }} />} />
                                                </Form.Item>
                                                <Row gutter={16}>
                                                    <Col span={12}>
                                                        <Form.Item name="newPassword" label="Mật khẩu mới" rules={[{ required: true, message: 'Nhập mật khẩu mới!' }]}>
                                                            <Input.Password prefix={<LockOutlined style={{ color: '#cbd5e1' }} />} />
                                                        </Form.Item>
                                                    </Col>
                                                    <Col span={12}>
                                                        <Form.Item
                                                            name="confirmPassword"
                                                            label="Xác nhận mật khẩu"
                                                            dependencies={['newPassword']}
                                                            rules={[
                                                                { required: true, message: 'Vui lòng xác minh lại mật khẩu!' },
                                                                ({ getFieldValue }) => ({
                                                                    validator(_, value) {
                                                                        if (!value || getFieldValue('newPassword') === value) {
                                                                            return Promise.resolve();
                                                                        }
                                                                        return Promise.reject(new Error('Mật khẩu không khớp!'));
                                                                    },
                                                                }),
                                                            ]}
                                                        >
                                                            <Input.Password prefix={<LockOutlined style={{ color: '#cbd5e1' }} />} />
                                                        </Form.Item>
                                                    </Col>
                                                </Row>
                                                <Divider style={{ margin: '12px 0 24px' }} />
                                                <Button type="primary" htmlType="submit" loading={changePasswordMutation.isPending} style={{ borderRadius: 8, height: 40, padding: '0 24px' }}>
                                                    Cập nhật mật khẩu
                                                </Button>
                                            </Form>
                                        </div>
                                    ),
                                },
                            ]}
                        />
                    </Card>
                </Col>
            </Row>
        </motion.div>
    );
};
