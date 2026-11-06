import React from 'react';
import { Button, Card } from 'antd';
import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

export const APP_ERROR_IMAGE = '/images/error_state.png';

export interface PageErrorStateProps {
    title?: string;
    subTitle?: string;
    image?: string;
    imageHeight?: number | string;
    minHeight?: number | string;
    status?: 'warning' | 'error' | '500' | '403' | '404' | 'info';
    error?: unknown;
    onRetry?: () => void;
    retryText?: string;
    showReportError?: boolean;
    onReportError?: () => void;
    reportText?: string;
    backUrl?: string;
    backText?: string;
    onBack?: () => void;
    extra?: React.ReactNode;
    style?: React.CSSProperties;
    bordered?: boolean;
}

export const PageErrorState: React.FC<PageErrorStateProps> = ({
    title = 'Úi, có lỗi rồi!',
    subTitle,
    image = APP_ERROR_IMAGE,
    imageHeight = 190,
    minHeight = 'calc(65vh)',
    error,
    onRetry,
    retryText = 'Thử lại ngay',
    showReportError = true,
    onReportError,
    reportText = 'Báo lỗi',
    backUrl,
    backText = 'Quay lại',
    onBack,
    extra,
    style,
    bordered = false,
}) => {
    const navigate = useNavigate();

    const resolvedSubTitle =
        subTitle ||
        (error as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message ||
        (error as { message?: string })?.message ||
        'Đã có sự cố khi kết nối đến hệ thống. Đừng lo, dữ liệu của bạn vẫn an toàn!';

    const handleBack = () => {
        if (onBack) {
            onBack();
        } else if (backUrl) {
            navigate(backUrl);
        } else {
            navigate(-1);
        }
    };

    const handleReport = () => {
        if (onReportError) {
            onReportError();
        } else {
            window.dispatchEvent(new CustomEvent('english4u:open-feedback'));
        }
    };

    const hasBackAction = !!backUrl || !!onBack;

    const content = (
        <div
            style={{
                width: '100%',
                flex: 1,
                minHeight: minHeight,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                padding: '24px 16px',
                margin: 'auto',
                ...style,
            }}
        >
            <div
                style={{
                    maxWidth: 520,
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    margin: '0 auto',
                }}
            >
                {image && (
                    <div
                        style={{
                            marginBottom: 20,
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            width: '100%',
                        }}
                    >
                        <img
                            src={image}
                            alt="Error state illustration"
                            style={{
                                height: imageHeight,
                                maxWidth: '100%',
                                objectFit: 'contain',
                                display: 'block',
                                margin: '0 auto',
                                filter: 'drop-shadow(0 10px 28px rgba(0, 0, 0, 0.07))',
                            }}
                        />
                    </div>
                )}

                <h2
                    style={{
                        margin: '0 0 10px 0',
                        fontSize: '26px',
                        fontWeight: 800,
                        color: '#0f172a',
                        letterSpacing: '-0.02em',
                        textAlign: 'center',
                        width: '100%',
                    }}
                >
                    {title}
                </h2>

                <p
                    style={{
                        margin: '0 auto 24px auto',
                        fontSize: '15px',
                        lineHeight: 1.6,
                        color: '#64748b',
                        maxWidth: 440,
                        textAlign: 'center',
                        width: '100%',
                    }}
                >
                    {resolvedSubTitle}
                </p>

                {extra || (
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 14,
                            flexWrap: 'wrap',
                            width: '100%',
                        }}
                    >
                        {onRetry && (
                            <Button
                                type="primary"
                                icon={<ReloadOutlined style={{ fontSize: '15px' }} />}
                                onClick={onRetry}
                                style={{
                                    background: 'linear-gradient(135deg, #fb923c 0%, #ea580c 100%)',
                                    border: 'none',
                                    borderRadius: 12,
                                    height: 42,
                                    padding: '0 24px',
                                    fontWeight: 700,
                                    fontSize: '15px',
                                    color: '#ffffff',
                                    boxShadow: '0 4px 14px rgba(234, 88, 12, 0.32)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 6,
                                }}
                            >
                                {retryText}
                            </Button>
                        )}

                        {showReportError && (
                            <Button
                                type="link"
                                onClick={handleReport}
                                style={{
                                    color: '#0284c7',
                                    fontWeight: 600,
                                    fontSize: '15px',
                                    padding: '0 10px',
                                    height: 42,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                {reportText}
                            </Button>
                        )}

                        {hasBackAction && (
                            <Button
                                icon={<ArrowLeftOutlined />}
                                onClick={handleBack}
                                style={{
                                    borderRadius: 12,
                                    height: 42,
                                    padding: '0 18px',
                                    fontWeight: 500,
                                    color: '#475569',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                {backText}
                            </Button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );

    if (bordered) {
        return (
            <Card
                bordered
                style={{
                    borderRadius: 24,
                    border: '1px solid #f1f5f9',
                    boxShadow: '0 4px 16px rgba(148, 163, 184, 0.05)',
                    padding: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
                styles={{
                    body: {
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    },
                }}
            >
                {content}
            </Card>
        );
    }

    return content;
};

export default PageErrorState;
