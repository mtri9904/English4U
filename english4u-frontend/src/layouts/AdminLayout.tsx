import React, { useState, useEffect, useMemo } from 'react';
import { Layout, Menu, Button, Dropdown, Avatar, theme, MenuProps, message, Badge, Popover, Divider, Empty, Spin } from 'antd';
import {
    DashboardOutlined,
    UserOutlined,
    FormOutlined,
    BellOutlined,
    PlaySquareOutlined,
    LogoutOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    CheckCircleOutlined,
    ReloadOutlined,
    BugOutlined,
    TrophyOutlined,
    RobotOutlined,
    LockOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useUserProfileQuery, studentService as userApi } from '@/features/students';
import { isTokenExpired } from '@/apis/axios.instance';
import { useQueryClient } from '@tanstack/react-query';
import {
    useClientNotificationStatsQuery,
    useClientNotificationsQuery,
    useUpdateClientNotificationReadMutation,
    useMarkAllClientNotificationsReadMutation,
    useBrowserNotification,
} from '@/features/notifications';
import { PdfGenerationProgressWidget } from '@/features/exams';
import { pdfGenerationJobStore } from '@/features/exams';
import { useRealtimeSync } from '@/features/realtime/hooks/useRealtimeSync';
import { formatDateTimeToMinute } from '@/shared/lib/dateTime';
import { APP_EMPTY_IMAGE } from '@/components/AppEmpty';

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

    const {
        permission: browserPermission,
        isRinging: isBellRinging,
        requestPermission: handleRequestBrowserPermission,
        stopRinging,
    } = useBrowserNotification({
        unreadCount: clientNotificationStats?.unread,
        latestNotification: notificationItems[0] ?? null,
        onNotificationClick: () => setIsNotificationOpen(true),
    });

    useEffect(() => {
        if (isNotificationOpen) {
            stopRinging();
        }
    }, [isNotificationOpen, stopRinging]);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token || isTokenExpired()) {
            // Token missing or expired -> clear session and redirect
            localStorage.removeItem('token');
            localStorage.removeItem('userId');
            pdfGenerationJobStore.clear();
            message.warning('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại!');
            navigate('/admin/login', { replace: true });
        }
    }, [navigate]);


    const { token: { colorBgContainer } } = theme.useToken();

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

            {browserPermission === 'default' && (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        padding: '8px 10px',
                        background: 'linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)',
                        borderRadius: 8,
                        border: '1px solid #bfdbfe',
                        marginTop: 8,
                        marginBottom: 4,
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: '#1e40af' }}>
                        <BellOutlined />
                        <span style={{ fontWeight: 600 }}>Bật thông báo trên máy tính</span>
                    </div>
                    <Button
                        type="primary"
                        size="small"
                        onClick={handleRequestBrowserPermission}
                        style={{ fontSize: '0.75rem', height: 26, borderRadius: 6, background: '#2563eb' }}
                    >
                        Bật ngay
                    </Button>
                </div>
            )}

            {browserPermission === 'granted' && (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '4px 6px',
                        fontSize: '0.72rem',
                        color: '#059669',
                        marginTop: 4,
                        marginBottom: 2,
                    }}
                >
                    <CheckCircleOutlined style={{ color: '#059669' }} />
                    <span>Đã bật thông báo trên trình duyệt</span>
                </div>
            )}

            {browserPermission === 'denied' && (
                <div
                    style={{
                        padding: '6px 10px',
                        fontSize: '0.72rem',
                        color: '#b45309',
                        background: '#fffbeb',
                        borderRadius: 6,
                        border: '1px solid #fef3c7',
                        marginTop: 4,
                        marginBottom: 4,
                        lineHeight: 1.35,
                    }}
                >
                    <WarningOutlined style={{ color: '#f59e0b', marginRight: 4 }} />
                    Thông báo trên trình duyệt đang bị chặn. Bấm vào icon ổ khóa <LockOutlined /> trên thanh địa chỉ để cho phép lại.
                </div>
            )}

            <Divider style={{ margin: '10px 0' }} />

            {isNotificationsLoading || isNotificationStatsLoading ? (
                <div style={{ display: 'grid', placeItems: 'center', minHeight: 120 }}>
                    <Spin size="small" />
                </div>
            ) : notificationItems.length === 0 ? (
                <Empty description="Chưa có thông báo" image={APP_EMPTY_IMAGE} imageStyle={{ height: 64 }} />
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
            label: 'Tổng quan',
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
            key: '/admin/leaderboard',
            icon: <TrophyOutlined />,
            label: 'Bảng xếp hạng & Thi đua',
        },
        {
            key: '/admin/notifications',
            icon: <BellOutlined />,
            label: 'Thông báo hệ thống',
        },
        {
            key: '/admin/feedbacks',
            icon: <BugOutlined />,
            label: 'Phản hồi & Báo lỗi',
        },
        {
            key: '/admin/ai-settings',
            icon: <RobotOutlined />,
            label: 'Cấu hình AI & Quota',
        }
    ];

    return (
        <Layout hasSider style={{ minHeight: '100vh' }}>
            <Sider
                trigger={null}
                collapsible
                collapsed={collapsed}
                width={260}
                collapsedWidth={80}
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
                <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid #f0f0f0' }}>
                    <h1 style={{ margin: 0, fontSize: collapsed ? '1.25rem' : '1.5rem', fontWeight: 800, color: '#0ea5e9', transition: 'all 0.3s' }}>
                        {collapsed ? 'E4U' : 'English4U Admin'}
                    </h1>
                </div>
                <Menu
                    mode="inline"
                    selectedKeys={[location.pathname]}
                    items={menuItems}
                    onClick={({ key }) => {
                        if (location.pathname === key) {
                            void queryClient.invalidateQueries();
                        } else {
                            navigate(key);
                        }
                    }}
                    style={{ borderRight: 0, marginTop: '8px' }}
                />
            </Sider>
            <Layout style={{
                marginLeft: collapsed ? 80 : 260,
                transition: 'margin-left 0.2s cubic-bezier(0.2, 0, 0, 1)',
                minHeight: '100vh',
                minWidth: 0,
                overflowX: 'hidden',
            }}>
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
                    height: 64,
                }}>
                    <Button
                        type="text"
                        aria-label={collapsed ? 'Mở thanh bên' : 'Thu gọn thanh bên'}
                        icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                        onClick={() => setCollapsed(!collapsed)}
                        style={{
                            fontSize: '18px',
                            width: 40,
                            height: 40,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: 8,
                        }}
                    />

                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <Popover
                            trigger="click"
                            placement="bottomRight"
                            open={isNotificationOpen}
                            onOpenChange={setIsNotificationOpen}
                            content={notificationPopoverContent}
                        >
                            <Badge
                                count={clientNotificationStats?.unread ?? 0}
                                size="small"
                                className={isBellRinging ? 'bell-badge-pulse' : ''}
                            >
                                <Button
                                    type="text"
                                    icon={<BellOutlined className={isBellRinging ? 'bell-ringing-active' : ''} />}
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
                <Content style={{
                    margin: '24px',
                    minHeight: 280,
                    minWidth: 0,
                }}>
                    <Outlet />
                </Content>
                <PdfGenerationProgressWidget />
            </Layout>
        </Layout>
    );
};
