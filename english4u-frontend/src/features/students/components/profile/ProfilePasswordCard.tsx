import React from 'react';
import { Button, Card, Col, Form, Input, Row, Typography } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import { fadeUp } from '../../utils/student.utils';

const { Title, Text } = Typography;

export interface PasswordFormValues {
    oldPassword: string;
    newPassword: string;
    confirmPassword?: string;
}

export interface ProfilePasswordCardProps {
    isChanging: boolean;
    onChangePassword: (values: { oldPassword: string; newPassword: string }) => Promise<void>;
}

export const ProfilePasswordCard: React.FC<ProfilePasswordCardProps> = ({
    isChanging,
    onChangePassword,
}) => {
    const [form] = Form.useForm<PasswordFormValues>();

    const handleSubmit = async (values: PasswordFormValues) => {
        await onChangePassword({
            oldPassword: values.oldPassword,
            newPassword: values.newPassword,
        });
        form.resetFields();
    };

    return (
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

                <Form form={form} layout="vertical" onFinish={handleSubmit}>
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
                        loading={isChanging}
                        style={{ height: 42, paddingInline: 22, borderRadius: 12 }}
                    >
                        Đổi mật khẩu
                    </Button>
                </Form>
            </Card>
        </motion.div>
    );
};

