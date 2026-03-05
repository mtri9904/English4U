import React, { useState, useEffect } from 'react';
import { Layout, Menu, Button, Dropdown, Avatar, theme, MenuProps, message } from 'antd';
import {
    DashboardOutlined,
    UserOutlined,
    FormOutlined,
    TrophyOutlined,
    CreditCardOutlined,
    BellOutlined,
    LogoutOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { GenerationProgressWidget } from '@/features/admin/components';
import { useUserProfileQuery } from '@/features/admin/api/user.api';
import { useQueryClient } from '@tanstack/react-query';

const { Header, Sider, Content } = Layout;

export const AdminLayout: React.FC = () => {
    const [collapsed, setCollapsed] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    const { data: profile } = useUserProfileQuery();
    const queryClient = useQueryClient();

    // Route Guard logic
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) {
            message.warning('Vui lòng đăng nhập để truy cập CMS!');
            navigate('/admin/login', { replace: true });
        }
    }, [navigate]);


    const { token: { colorBgContainer, borderRadiusLG } } = theme.useToken();

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('userId');
        queryClient.clear();
        navigate('/admin/login');
    };

    const userMenu: MenuProps = {
        items: [
            {
                key: 'profile',
                icon: <UserOutlined />,
                label: 'Tài khoản',
                onClick: () => navigate('/admin/profile')
            },
            {
                type: 'divider',
            },
            {
                key: 'logout',
                icon: <LogoutOutlined />,
                label: 'Đăng xuất',
                danger: true,
                onClick: handleLogout
            }
        ]
    };

    const menuItems = [
        {
            key: '/admin/dashboard',
            icon: <DashboardOutlined />,
            label: 'Tổng quan (Dashboard)',
        },
        {
            key: '/admin/users',
            icon: <UserOutlined />,
            label: 'Quản lý Học viên',
        },
        {
            key: '/admin/exams',
            icon: <FormOutlined />,
            label: 'Bài thi & Kiểm tra',
        },
        {
            key: '/admin/gamification',
            icon: <TrophyOutlined />,
            label: 'Thành tích & Cấp độ',
        },
        {
            key: '/admin/billing',
            icon: <CreditCardOutlined />,
            label: 'Thanh toán & Gói',
        },
        {
            key: '/admin/notifications',
            icon: <BellOutlined />,
            label: 'Thông báo hệ thống',
        }
    ];

    return (
        <Layout style={{ minHeight: '100vh', fontFamily: 'var(--font-sans)', display: 'flex' }}>
            <Sider
                trigger={null}
                collapsible
                collapsed={collapsed}
                width={260}
                theme="light"
                style={{
                    borderRight: '1px solid #f0f0f0',
                    height: '100vh',
                    position: 'fixed',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    zIndex: 1001,
                    overflow: 'auto'
                }}
            >
                <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid #f0f0f0' }}>
                    <h1 style={{ margin: 0, fontSize: collapsed ? '1.25rem' : '1.5rem', fontWeight: 800, color: '#0ea5e9', transition: 'all 0.3s' }}>
                        {collapsed ? 'E4U' : 'English4U Admin'}
                    </h1>
                </div>
                <Menu
                    mode="inline"
                    selectedKeys={[location.pathname]}
                    items={menuItems}
                    onClick={({ key }) => navigate(key)}
                    style={{ borderRight: 0, marginTop: '8px' }}
                />
            </Sider>
            <Layout style={{ marginLeft: collapsed ? 80 : 260, transition: 'margin-left 0.2s', minHeight: '100vh' }}>
                <Header style={{
                    padding: '0 24px',
                    background: colorBgContainer,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: '1px solid #f0f0f0',
                    position: 'sticky',
                    top: 0,
                    zIndex: 1000,
                    width: '100%'
                }}>
                    <Button
                        type="text"
                        icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                        onClick={() => setCollapsed(!collapsed)}
                        style={{ fontSize: '16px', width: 64, height: 64, marginLeft: '-24px' }}
                    />

                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <Button type="text" icon={<BellOutlined />} style={{ fontSize: '16px' }} />
                        <Dropdown menu={userMenu} placement="bottomRight" trigger={['click']}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '0 8px', borderRadius: '8px' }}>
                                <Avatar
                                    src={profile?.avatarUrl}
                                    style={{ backgroundColor: '#0ea5e9' }}
                                >
                                    {profile?.displayName?.charAt(0)?.toUpperCase() || 'A'}
                                </Avatar>
                                <span style={{ fontWeight: 600 }}>{profile?.displayName || 'Admin'}</span>
                            </div>
                        </Dropdown>
                    </div>
                </Header>
                <Content style={{ margin: '24px', padding: 24, minHeight: 280, background: colorBgContainer, borderRadius: borderRadiusLG }}>
                    <Outlet />
                </Content>
                <GenerationProgressWidget />
            </Layout>
        </Layout>
    );
};
