import React from 'react';
import { Button, Card, Result, Space } from 'antd';
import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

export interface PageErrorStateProps {
    title?: string;
    subTitle?: string;
    status?: 'warning' | 'error' | '500' | '403' | '404' | 'info';
    error?: unknown;
    onRetry?: () => void;
    retryText?: string;
    backUrl?: string;
    backText?: string;
    onBack?: () => void;
    extra?: React.ReactNode;
    style?: React.CSSProperties;
    bordered?: boolean;
}

export const PageErrorState: React.FC<PageErrorStateProps> = ({
    title = 'Không thể tải dữ liệu',
    subTitle,
    status = 'warning',
    error,
    onRetry,
    retryText = 'Thử lại',
    backUrl,
    backText = 'Quay lại',
    onBack,
    extra,
    style,
    bordered = true,
}) => {
    const navigate = useNavigate();

    const resolvedSubTitle =
        subTitle ||
        (error as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message ||
        (error as { message?: string })?.message ||
        'Đã có sự cố khi kết nối đến hệ thống. Vui lòng kiểm tra lại mạng hoặc thử lại sau.';

    const handleBack = () => {
        if (onBack) {
            onBack();
        } else if (backUrl) {
            navigate(backUrl);
        } else {
            navigate(-1);
        }
    };

    const hasBackAction = !!backUrl || !!onBack;

    return (
        <Card
            bordered={bordered}
            style={{
                borderRadius: 24,
                border: bordered ? '1px solid #f1f5f9' : 'none',
                boxShadow: bordered ? '0 4px 16px rgba(148, 163, 184, 0.05)' : 'none',
                padding: '16px 8px',
                textAlign: 'center',
                ...style,
            }}
        >
            <Result
                status={status}
                title={<span style={{ fontWeight: 700, color: '#0f172a' }}>{title}</span>}
                subTitle={<span style={{ color: '#64748b', fontSize: '0.925rem' }}>{resolvedSubTitle}</span>}
                extra={
                    extra || (
                        <Space size="middle" wrap>
                            {onRetry && (
                                <Button
                                    type="primary"
                                    icon={<ReloadOutlined />}
                                    onClick={onRetry}
                                    style={{
                                        borderRadius: 12,
                                        height: 38,
                                        fontWeight: 600,
                                        padding: '0 20px',
                                        background: 'linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)',
                                        border: 'none',
                                        boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
                                    }}
                                >
                                    {retryText}
                                </Button>
                            )}
                            {hasBackAction && (
                                <Button
                                    icon={<ArrowLeftOutlined />}
                                    onClick={handleBack}
                                    style={{
                                        borderRadius: 12,
                                        height: 38,
                                        fontWeight: 500,
                                        padding: '0 16px',
                                        color: '#475569',
                                    }}
                                >
                                    {backText}
                                </Button>
                            )}
                        </Space>
                    )
                }
            />
        </Card>
    );
};

