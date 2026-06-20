import React, { useState, useEffect, useMemo } from 'react';
import { Layout, Menu, Button, Dropdown, Avatar, theme, MenuProps, message, Badge, Popover, Divider, Empty, Spin } from 'antd';
import {
    DashboardOutlined,
    UserOutlined,
    FormOutlined,
    TrophyOutlined,
    BellOutlined,
    PlaySquareOutlined,
    LogoutOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    CheckCircleOutlined,
    ReloadOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useUserProfileQuery, userApi } from '@/features/admin/api/user.api';
import { isTokenExpired } from '@/apis/axios.instance';
import { useQueryClient } from '@tanstack/react-query';
import {
    useClientNotificationStatsQuery,
    useClientNotificationsQuery,
    useUpdateClientNotificationReadMutation,
    useMarkAllClientNotificationsReadMutation,
} from '@/features/client/api/notification.api';
import { PdfGenerationProgressWidget } from '@/features/admin/components/PdfGenerationProgressWidget';
import { pdfGenerationJobStore } from '@/features/admin/stores/pdfGenerationJob.store';
import { useRealtimeSync } from '@/features/realtime/hooks/useRealtimeSync';
import { formatDateTimeToMinute } from '@/shared/lib/dateTime';

const { Header, Sider, Content } = Layout;

export const AdminLayout: React.FC = () => {
    const [collapsed, setCollapsed] = useState(false);
    const [isNotificationOpen, setIsNotificationOpen] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    const { data: profile } = useUserProfileQuery();
    const queryClient = useQueryClient();
    const hasUserId = !!localStorage.getItem('userId');
    const hasToken = !!localStorage.getItem('token');
    const notificationQueryParams = useMemo(() => ({ pageNumber: 1, pageSize: 8 }), []);
    useRealtimeSync(hasToken);

    const {
        data: clientNotificationStats,
        isLoading: isNotificationStatsLoading,
    } = useClientNotificationStatsQuery({
        enabled: hasUserId,
    });
    const {
        data: clientNotificationsPaged,
        isLoading: isNotificationsLoading,
        isFetching: isNotificationsFetching,
        refetch: refetchNotifications,
    } = useClientNotificationsQuery(notificationQueryParams, {
        enabled: hasUserId && isNotificationOpen,
    });
    const updateNotificationReadMutation = useUpdateClientNotificationReadMutation();
    const markAllNotificationsReadMutation = useMarkAllClientNotificationsReadMutation();
    const notificationItems = clientNotificationsPaged?.items ?? [];

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token || isTokenExpired()) {
            // Token không tồn tại hoặc đã hết hạn → clear và redirect
            localStorage.removeItem('token');
            localStorage.removeItem('userId');
            pdfGenerationJobStore.clear();
            message.warning('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại!');
            navigate('/admin/login', { replace: true });
        }
    }, [navigate]);


    const { token: { colorBgContainer, borderRadiusLG } } = theme.useToken();

    const handleLogout = async () => {
        try {
            await userApi.markOffline();
        } catch {
            // Ignore offline update errors on logout flow.
        }
        pdfGenerationJobStore.clear();
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('userId');
        queryClient.clear();
        navigate('/admin/login');
    };

    const handleUpdateNotificationRead = async (id: string, isRead: boolean) => {
        try {
            await updateNotificationReadMutation.mutateAsync({ id, isRead });
        } catch {
            // Keep header interactions smooth even if network/API is temporarily unavailable.
        }
    };

    const handleMarkAllRead = async () => {
        try {
            await markAllNotificationsReadMutation.mutateAsync();
        } catch {
            // Keep header interactions smooth even if network/API is temporarily unavailable.
        }
    };

    const notificationPopoverContent = (
        <div style={{ width: 380, maxWidth: 'calc(100vw - 24px)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontWeight: 700, color: '#0f172a' }}>Thông báo hệ thống</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Button
                        type="text"
                        size="small"
                        icon={<ReloadOutlined spin={isNotificationsFetching} />}
                        onClick={() => refetchNotifications()}
                    />
                    <Button
                        type="text"
                        size="small"
                        icon={<CheckCircleOutlined />}
                        loading={markAllNotificationsReadMutation.isPending}
                        onClick={handleMarkAllRead}
                    >
                        Đọc tất cả
                    </Button>
                </div>
            </div>
            <Divider style={{ margin: '10px 0' }} />

            {isNotificationsLoading || isNotificationStatsLoading ? (
                <div style={{ display: 'grid', placeItems: 'center', minHeight: 120 }}>
                    <Spin size="small" />
                </div>
            ) : notificationItems.length === 0 ? (
                <Empty description="Chưa có thông báo" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 340, overflowY: 'auto' }}>
                    {notificationItems.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                                handleUpdateNotificationRead(item.id, true);
                                setIsNotificationOpen(false);
                                navigate('/admin/notifications');
                            }}
                            style={{
                                border: '1px solid #e2e8f0',
                                borderLeft: `3px solid ${item.isRead ? '#94a3b8' : '#2563eb'}`,
                                background: item.isRead ? '#ffffff' : '#f8fbff',
                                borderRadius: 10,
                                padding: '10px 10px 8px',
                                textAlign: 'left',
                                cursor: 'pointer',
                                width: '100%',
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.85rem' }}>{item.title}</div>
                                {!item.isRead && <Badge color="#2563eb" />}
                            </div>
                            <div style={{ color: '#475569', fontSize: '0.78rem', marginTop: 4, lineHeight: 1.35 }}>
                                {item.message || 'Không có nội dung chi tiết.'}
                            </div>
                            <div style={{ marginTop: 6, color: '#94a3b8', fontSize: '0.72rem' }}>
                                {formatDateTimeToMinute(item.createdAt) || 'N/A'}
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );

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
            key: '/admin/attempts',
            icon: <PlaySquareOutlined />,
            label: 'Lượt thi',
        },
        {
            key: '/admin/gamification',
            icon: <TrophyOutlined />,
            label: 'Thành tích & Cấp độ',
        },
        {
            key: '/admin/notifications',
            icon: <BellOutlined />,
            label: 'Thông báo hệ thống',
        }
    ];

    return (
        <Layout style={{ minHeight: '100vh', display: 'flex' }}>
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
                        <Popover
                            trigger="click"
                            placement="bottomRight"
                            open={isNotificationOpen}
                            onOpenChange={setIsNotificationOpen}
                            content={notificationPopoverContent}
                        >
                            <Badge count={clientNotificationStats?.unread ?? 0} size="small">
                                <Button
                                    type="text"
                                    icon={<BellOutlined />}
                                    style={{ fontSize: '16px' }}
                                />
                            </Badge>
                        </Popover>
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
                <PdfGenerationProgressWidget />
            </Layout>
        </Layout>
    );
};
