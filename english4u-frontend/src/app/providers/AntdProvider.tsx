import React from 'react';
import { App, ConfigProvider, Empty } from 'antd';
import { StyleProvider } from '@ant-design/cssinjs';
import { APP_EMPTY_IMAGE } from '@/components/AppEmpty';

interface AntdProviderProps {
    children: React.ReactNode;
}

/**
 * AntdProvider - Centralized Ant Design theme & context provider
 * Wraps with <App> component following Mebifarm CMS (web) architecture
 */
export const AntdProvider: React.FC<AntdProviderProps> = ({ children }) => {
    return (
        <StyleProvider layer>
            <ConfigProvider
                renderEmpty={() => (
                    <Empty
                        image={APP_EMPTY_IMAGE}
                        imageStyle={{
                            height: 88,
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            margin: '0 auto',
                        }}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            textAlign: 'center',
                        }}
                        description="Không có dữ liệu phù hợp"
                    />
                )}
                theme={{
                    token: {
                        colorPrimary: '#2563eb',
                        fontFamily: 'var(--font-sans, system-ui, -apple-system, sans-serif)',
                        borderRadius: 8,
                    },
                    components: {
                        Button: {
                            controlHeight: 38,
                            borderRadius: 8,
                            fontWeight: 600,
                        },
                        Card: {
                            borderRadiusLG: 16,
                        },
                        Modal: {
                            borderRadiusLG: 16,
                        },
                        Table: {
                            borderRadius: 12,
                        },
                    },
                }}
            >
                <App>{children}</App>
            </ConfigProvider>
        </StyleProvider>
    );
};

export default AntdProvider;
