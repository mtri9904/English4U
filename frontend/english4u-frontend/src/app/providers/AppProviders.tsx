import { type ReactNode } from 'react'
import { ConfigProvider } from 'antd'
import { StyleProvider } from '@ant-design/cssinjs'
import { QueryClientProvider } from '@tanstack/react-query'
import { antdTheme } from './antd-theme'
import { queryClient } from './query-client'

export function AppProviders({ children }: { children: ReactNode }) {
    return (
        <StyleProvider layer>
            <ConfigProvider theme={antdTheme}>
                <QueryClientProvider client={queryClient}>
                    {children}
                </QueryClientProvider>
            </ConfigProvider>
        </StyleProvider>
    )
}
