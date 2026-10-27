import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Result, Button, Space } from 'antd';
import { ReloadOutlined, HomeOutlined } from '@ant-design/icons';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error in ErrorBoundary:', error, errorInfo);
    }

    private handleReset = () => {
        this.setState({ hasError: false, error: null });
        window.location.reload();
    };

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div
                    style={{
                        minHeight: '60vh',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '24px',
                    }}
                >
                    <Result
                        status="error"
                        title="Đã xảy ra sự cố ngoài ý muốn"
                        subTitle={
                            this.state.error?.message ||
                            'Hệ thống gặp lỗi trong quá trình xử lý giao diện. Vui lòng thử tải lại trang.'
                        }
                        extra={
                            <Space size="middle">
                                <Button
                                    type="primary"
                                    icon={<ReloadOutlined />}
                                    onClick={this.handleReset}
                                    style={{ borderRadius: 8 }}
                                >
                                    Tải lại trang
                                </Button>
                                <Button
                                    icon={<HomeOutlined />}
                                    onClick={() => (window.location.href = '/')}
                                    style={{ borderRadius: 8 }}
                                >
                                    Về trang chủ
                                </Button>
                            </Space>
                        }
                    />
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;

