import React from 'react';
import { Card, Row, Col, Space, Typography, Tag, Tooltip, Button } from 'antd';
import { RobotOutlined, CheckCircleOutlined, WarningOutlined, ReloadOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

export interface AiSettingsHeaderProps {
    projectId?: string;
    hasQuotaAccess?: boolean;
    quotaMessage?: string | null;
    isRefreshing: boolean;
    disabled?: boolean;
    onRefresh: () => void;
}

export const AiSettingsHeader: React.FC<AiSettingsHeaderProps> = ({
    projectId,
    hasQuotaAccess,
    quotaMessage,
    isRefreshing,
    disabled = false,
    onRefresh,
}) => {
    return (
        <Card style={{ borderRadius: 12, border: '1px solid #f0f0f0' }}>
            <Row justify="space-between" align="middle" gutter={[16, 16]}>
                <Col xs={24} md={16}>
                    <Space align="center" size={12}>
                        <div
                            style={{
                                width: 44,
                                height: 44,
                                borderRadius: 10,
                                background: 'linear-gradient(135deg, #1890ff, #722ed1)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#fff',
                                fontSize: 22,
                            }}
                        >
                            <RobotOutlined />
                        </div>
                        <div>
                            <Title level={4} style={{ margin: 0 }}>
                                Cấu hình AI & Quota Google Gemini
                            </Title>
                            <Text type="secondary">
                                Quản lý hạn mức thực tế và chỉ định model AI cho từng chức năng trong hệ thống.
                            </Text>
                        </div>
                    </Space>
                </Col>
                <Col xs={24} md={8} style={{ textAlign: 'right' }}>
                    <Space wrap>
                        {projectId && (
                            <Tag color="purple" style={{ padding: '4px 8px', fontSize: 12 }}>
                                Project: <b>{projectId}</b>
                            </Tag>
                        )}
                        {hasQuotaAccess ? (
                            <Tooltip title="Đã xác thực Service Account và lấy hạn mức trực tiếp từ Google Cloud Quotas API">
                                <Tag icon={<CheckCircleOutlined />} color="success" style={{ padding: '4px 8px' }}>
                                    Cloud Quotas Live
                                </Tag>
                            </Tooltip>
                        ) : (
                            <Tooltip title={quotaMessage || 'Chưa kết nối Quotas API'}>
                                <Tag icon={<WarningOutlined />} color="warning" style={{ padding: '4px 8px' }}>
                                    Quotas API Tắt
                                </Tag>
                            </Tooltip>
                        )}
                        <Button
                            icon={<ReloadOutlined spin={isRefreshing} />}
                            onClick={onRefresh}
                            disabled={disabled}
                        >
                            Làm mới
                        </Button>
                    </Space>
                </Col>
            </Row>
        </Card>
    );
};

