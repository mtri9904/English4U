import React from 'react';
import { ConfigProvider } from 'antd';
import { StyleProvider } from '@ant-design/cssinjs';

export const AntdProvider = ({ children }: { children: React.ReactNode }) => {
    return (
        <StyleProvider layer>
            <ConfigProvider
                theme={{
                    token: {
                        // Customize your primary color and other tokens here
                        colorPrimary: '#1677ff',
                        fontFamily: 'Inter, sans-serif',
                    },
                }}
            >
                {children}
            </ConfigProvider>
        </StyleProvider>
    );
};
