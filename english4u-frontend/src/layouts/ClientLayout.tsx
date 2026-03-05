import React, { useState, useEffect } from 'react';
import { Layout, Menu, Avatar, Dropdown, Badge, Button, theme, Typography } from 'antd';
import type { MenuProps } from 'antd';
import {
    HomeOutlined,
    ReadOutlined,
    TrophyOutlined,
    BookOutlined,
    BellOutlined,
    UserOutlined,
    LogoutOutlined,
    SettingOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    FireOutlined,
    BarChartOutlined,
    StarOutlined
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useUserProfileQuery } from '@/features/admin/api/user.api';
import { useQueryClient } from '@tanstack/react-query';

const { Sider, Content } = Layout;
const { Text } = Typography;

export const ClientLayout: React.FC = () => {
    const [collapsed, setCollapsed] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    const { data: profile } = useUserProfileQuery();
    const queryClient = useQueryClient();
    const { token: { colorBgContainer, borderRadiusLG } } = theme.useToken();

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) {
            navigate('/login', { replace: true });
        }
    }, [navigate]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('userId');
        queryClient.clear();
        navigate('/login');
    };

    const userMenuItems: MenuProps['items'] = [
        {
            key: 'profile',
            icon: <UserOutlined />,
            label: 'Hồ sơ cá nhân',
            onClick: () => navigate('/app/profile')
        },
        {
            key: 'settings',
            icon: <SettingOutlined />,
            label: 'Cài đặt',
            onClick: () => navigate('/app/settings')
        },
        { type: 'divider' },
        {
            key: 'logout',
            icon: <LogoutOutlined />,
            label: 'Đăng xuất',
            danger: true,
            onClick: handleLogout
        }
    ];

    const sidebarItems: MenuProps['items'] = [
        {
            key: '/app',
            icon: <HomeOutlined />,
            label: 'Trang chủ',
        },
        {
            key: '/app/practice',
            icon: <ReadOutlined />,
            label: 'Luyện thi',
        },
        {
            key: '/app/my-exams',
            icon: <BookOutlined />,
            label: 'Bài thi của tôi',
        },
        {
            key: '/app/progress',
            icon: <BarChartOutlined />,
            label: 'Tiến trình học',
        },
        {
            key: '/app/achievements',
            icon: <TrophyOutlined />,
            label: 'Thành tích',
        },
        {
            key: '/app/flashcards',
            icon: <StarOutlined />,
            label: 'Flashcards',
        },
    ];

    return (
        <Layout style={{ minHeight: '100vh', fontFamily: 'var(--font-sans)' }}>
            <Sider
                trigger={null}
                collapsible
                collapsed={collapsed}
                width={260}
                collapsedWidth={isMobile ? 0 : 72}
                theme="light"
                style={{
                    borderRight: '1px solid #f0f0f0',
                    height: '100vh',
                    position: 'fixed',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    zIndex: 1001,
                    overflow: 'auto',
                    background: '#fff',
                }}
            >
                <div style={{
                    height: 64,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    borderBottom: '1px solid #f0f0f0',
                    padding: '0 16px',
                    flexShrink: 0,
                }}>
                    <img
                        src="/logo/Logo.png"
                        alt="English4U"
                        style={{ width: 36, height: 36, objectFit: 'contain' }}
                    />
                    {!collapsed && (
                        <span style={{
                            fontSize: '1.25rem',
                            fontWeight: 800,
                            background: 'linear-gradient(135deg, #137dc5, #7c3aed)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            whiteSpace: 'nowrap',
                        }}>
                            English4U
                        </span>
                    )}
                </div>

                {!collapsed && (
                    <div style={{
                        margin: '16px 16px 8px',
                        padding: '14px 16px',
                        background: 'linear-gradient(135deg, #e0f2fe, #ede9fe)',
                        borderRadius: 14,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                    }}>
                        <div style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            background: 'linear-gradient(135deg, #137dc5, #7c3aed)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}>
                            <FireOutlined style={{ color: '#fff', fontSize: 16 }} />
                        </div>
                        <div>
                            <Text strong style={{ fontSize: 13, display: 'block', lineHeight: 1.3 }}>Streak: 0 ngày</Text>
                            <Text type="secondary" style={{ fontSize: 11 }}>Hãy bắt đầu luyện tập!</Text>
                        </div>
                    </div>
                )}

                <Menu
                    mode="inline"
                    selectedKeys={[location.pathname]}
                    items={sidebarItems}
                    onClick={({ key }) => navigate(key)}
                    style={{
                        borderRight: 0,
                        marginTop: 8,
                        fontWeight: 500,
                    }}
                />
            </Sider>

            <Layout style={{
                marginLeft: collapsed ? (isMobile ? 0 : 72) : 260,
                transition: 'margin-left 0.2s',
                minHeight: '100vh',
            }}>
                <div style={{
                    height: 64,
                    padding: '0 24px',
                    background: colorBgContainer,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: '1px solid #f0f0f0',
                    position: 'sticky',
                    top: 0,
                    zIndex: 1000,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Button
                            type="text"
                            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                            onClick={() => setCollapsed(!collapsed)}
                            style={{ fontSize: 16, width: 40, height: 40 }}
                        />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <Badge count={0} size="small">
                            <Button type="text" icon={<BellOutlined />} style={{ fontSize: 16 }} />
                        </Badge>

                        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                cursor: 'pointer',
                                padding: '4px 12px 4px 4px',
                                borderRadius: 100,
                                background: '#f8fafc',
                                border: '1px solid #f0f0f0',
                                transition: 'all 0.2s',
                            }}>
                                <Avatar
                                    size={32}
                                    src={profile?.avatarUrl}
                                    style={{ backgroundColor: '#137dc5' }}
                                >
                                    {profile?.displayName?.charAt(0)?.toUpperCase() || 'U'}
                                </Avatar>
                                <span style={{ fontWeight: 600, fontSize: 13, color: '#334155' }}>
                                    {profile?.displayName || 'Học viên'}
                                </span>
                            </div>
                        </Dropdown>
                    </div>
                </div>

                <Content style={{
                    margin: 24,
                    padding: 24,
                    minHeight: 280,
                    background: colorBgContainer,
                    borderRadius: borderRadiusLG,
                }}>
                    <Outlet />
                </Content>
            </Layout>
        </Layout>
    );
};
