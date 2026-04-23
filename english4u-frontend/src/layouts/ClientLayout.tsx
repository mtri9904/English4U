import React, { useState, useEffect, useMemo } from 'react';
import { Layout, Menu, Avatar, Dropdown, Badge, Button, theme, Typography, Popover, Divider, Empty, Spin } from 'antd';
import type { MenuProps } from 'antd';
import {
    HomeOutlined,
    ReadOutlined,
    BookOutlined,
    BellOutlined,
    UserOutlined,
    LogoutOutlined,
    SettingOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    BarChartOutlined,
    CheckCircleOutlined,
    FireOutlined,
    ReloadOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useUserProfileQuery, userApi } from '@/features/admin/api/user.api';
import { useQueryClient } from '@tanstack/react-query';
import {
    useClientNotificationStatsQuery,
    useClientNotificationsQuery,
    useMarkAllClientNotificationsReadMutation,
    useUpdateClientNotificationReadMutation,
} from '@/features/client/api/notification.api';
import { useRealtimeSync } from '@/features/realtime/hooks/useRealtimeSync';
import { formatDateTimeToMinute } from '@/shared/lib/dateTime';

const { Sider, Content } = Layout;
const { Text } = Typography;

export const ClientLayout: React.FC = () => {
    const [collapsed, setCollapsed] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [isNotificationOpen, setIsNotificationOpen] = useState(false);
    const hasUserId = !!localStorage.getItem('userId');
    const hasToken = !!localStorage.getItem('token');
    const navigate = useNavigate();
    const location = useLocation();
    const { data: profile } = useUserProfileQuery();
    const queryClient = useQueryClient();
    const { token: { colorBgContainer, borderRadiusLG } } = theme.useToken();
    const notificationQueryParams = useMemo(() => ({ pageNumber: 1, pageSize: 8 }), []);
    const isExamRunner = /^\/app\/sessions\/[^/]+\/(reading|listening|writing)$/i.test(location.pathname);
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

    const handleLogout = async () => {
        try {
            await userApi.markOffline();
        } catch {
            // Ignore offline update errors on logout flow.
        }
        localStorage.removeItem('token');
        localStorage.removeItem('userId');
        queryClient.clear();
        navigate('/login');
    };

    const handleUpdateNotificationRead = async (id: string, isRead: boolean) => {
        try {
            await updateNotificationReadMutation.mutateAsync({ id, isRead });
        } catch {
            // Silent fail: keep panel responsive even if server is temporarily unavailable.
        }
    };

    const handleMarkAllRead = async () => {
        try {
            await markAllNotificationsReadMutation.mutateAsync();
        } catch {
            // Silent fail: keep panel responsive even if server is temporarily unavailable.
        }
    };

    const notificationPopoverContent = (
        <div style={{ width: 360, maxWidth: 'calc(100vw - 24px)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontWeight: 700, color: '#0f172a' }}>Thông báo</div>
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
                            onClick={() => handleUpdateNotificationRead(item.id, true)}
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
            label: 'Tiến trình thi',
        },
    ];

    const sidebarToggleButton = (
        <Button
            type="text"
            aria-label={collapsed ? 'Mở sidebar' : 'Thu sidebar'}
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{
                fontSize: 16,
                width: 36,
                height: 36,
                borderRadius: 10,
                color: '#334155',
                background: '#fff',
                border: '1px solid #e2e8f0',
                boxShadow: '0 8px 22px rgba(15, 23, 42, 0.08)',
            }}
        />
    );

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
                    overflow: 'visible',
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
                    position: 'relative',
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

                <div style={{ height: 'calc(100vh - 136px)', overflowY: 'auto', overflowX: 'hidden', paddingBottom: 16 }}>
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
                </div>

                {(!isMobile || !collapsed) && (
                    <div
                        style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            bottom: 0,
                            height: 72,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 0,
                            borderTop: '1px solid #f1f5f9',
                            background: 'rgba(255, 255, 255, 0.96)',
                        }}
                    >
                        {sidebarToggleButton}
                    </div>
                )}
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
                    alignItems: 'center',
                    gap: 12,
                    borderBottom: '1px solid #f0f0f0',
                    position: 'sticky',
                    top: 0,
                    zIndex: 1000,
                }}>
                    {isMobile && collapsed && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            {sidebarToggleButton}
                        </div>
                    )}

                    <div
                        id="client-page-header-slot"
                        style={{
                            flex: 1,
                            minWidth: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            overflow: 'hidden',
                            height: '100%',
                        }}
                    />

                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
                        <Popover
                            trigger="click"
                            placement="bottomRight"
                            open={isNotificationOpen}
                            onOpenChange={setIsNotificationOpen}
                            content={notificationPopoverContent}
                        >
                            <Badge count={clientNotificationStats?.unread ?? 0} size="small">
                                <Button type="text" icon={<BellOutlined />} style={{ fontSize: 16 }} />
                            </Badge>
                        </Popover>

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
                    margin: isExamRunner ? 0 : 24,
                    padding: isExamRunner ? 0 : 24,
                    minHeight: 280,
                    background: colorBgContainer,
                    borderRadius: isExamRunner ? 0 : borderRadiusLG,
                }}>
                    <Outlet />
                </Content>
            </Layout>
        </Layout>
    );
};
