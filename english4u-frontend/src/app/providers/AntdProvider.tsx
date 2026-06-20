import React from 'react';
import { ConfigProvider } from 'antd';
import { StyleProvider } from '@ant-design/cssinjs';

export const AntdProvider = ({ children }: { children: React.ReactNode }) => {
    return (
        <StyleProvider layer>
            <ConfigProvider
                theme={{
                    token: {
                        colorPrimary: '#1677ff',
                        fontFamily: 'var(--font-sans)',
                    },
                }}
            >
                {children}
            </ConfigProvider>
        </StyleProvider>
    );
};
