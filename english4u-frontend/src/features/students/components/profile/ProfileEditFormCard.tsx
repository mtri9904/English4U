import React, { useEffect } from 'react';
import { Button, Card, Col, Form, Input, Row, Select, Typography } from 'antd';
import { MailOutlined, PhoneOutlined, UserOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import { fadeUp } from '../../utils/student.utils';
import { PROFILE_GOAL_OPTIONS } from '../../constants/student.constants';
import type { UserProfileDto } from '../../types/user.types';

const { Title, Text } = Typography;

export interface ProfileFormValues {
    displayName: string;
    phone?: string;
    position?: string;
}

export interface ProfileEditFormCardProps {
    profile: UserProfileDto;
    isUpdating: boolean;
    onUpdate: (values: ProfileFormValues) => Promise<void>;
}

export const ProfileEditFormCard: React.FC<ProfileEditFormCardProps> = ({
    profile,
    isUpdating,
    onUpdate,
}) => {
    const [form] = Form.useForm<ProfileFormValues>();

    useEffect(() => {
        form.setFieldsValue({
            displayName: profile.displayName || '',
            phone: profile.phone || '',
            position: profile.position || '',
        });
    }, [profile, form]);

    return (
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

                <Form form={form} layout="vertical" onFinish={onUpdate}>
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
                            <Form.Item label="Email">
                                <Input disabled value={profile.email} prefix={<MailOutlined style={{ color: '#94a3b8' }} />} />
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
                        loading={isUpdating}
                        style={{ height: 42, paddingInline: 22, borderRadius: 12 }}
                    >
                        Lưu thay đổi
                    </Button>
                </Form>
            </Card>
        </motion.div>
    );
};

