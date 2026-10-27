import React from 'react';
import { App, ConfigProvider } from 'antd';
import { StyleProvider } from '@ant-design/cssinjs';

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
