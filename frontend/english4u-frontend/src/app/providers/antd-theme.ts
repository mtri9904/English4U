import type { ThemeConfig } from 'antd'

export const antdTheme: ThemeConfig = {
    token: {
        colorPrimary: '#137dc5',
        colorSuccess: '#22c55e',
        colorWarning: '#f59e0b',
        colorError: '#ef4444',
        colorBgBase: '#f4f4f7',
        colorBgContainer: 'rgba(255, 255, 255, 0.72)',
        colorTextBase: '#0f1c2e',
        colorTextSecondary: '#5a6a7e',
        colorBorder: 'rgba(19, 125, 197, 0.18)',
        fontFamily: "'Inter', 'DM Sans', system-ui, sans-serif",
        fontSize: 15,
        borderRadius: 12,
        borderRadiusSM: 6,
        borderRadiusLG: 18,
        controlHeight: 42,
        controlHeightLG: 50,
        motionDurationFast: '0.15s',
        motionDurationMid: '0.25s',
    },
    components: {
        Button: { borderRadius: 12, fontWeight: 600, paddingInline: 24 },
        Input: { borderRadius: 12 },
        Card: { borderRadius: 18 },
        Modal: { borderRadius: 18 },
        Tag: { borderRadius: 9999 },
        Table: { borderRadius: 12, headerBg: 'rgba(19, 125, 197, 0.05)' },
        Menu: { borderRadius: 12, itemBorderRadius: 10 },
    },
}
