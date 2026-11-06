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
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    CheckCircleOutlined,
    ReloadOutlined,
    RiseOutlined,
    ThunderboltOutlined,
    CustomerServiceOutlined,
    GlobalOutlined,
    TrophyOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useUserProfileQuery, studentService as userApi } from '@/features/students';
import { isTokenExpired } from '@/apis/axios.instance';
import { useQueryClient } from '@tanstack/react-query';
import {
    useClientNotificationStatsQuery,
    useClientNotificationsQuery,
    useMarkAllClientNotificationsReadMutation,
    useUpdateClientNotificationReadMutation,
    useBrowserNotification,
} from '@/features/notifications';
import { getStreakDisplayMeta } from '@/features/gamification';
import { useRealtimeSync } from '@/features/realtime/hooks/useRealtimeSync';
import { formatDateTimeToMinute } from '@/shared/lib/dateTime';
import { FeedbackModal } from '@/features/feedbacks';
import { APP_EMPTY_IMAGE } from '@/components/AppEmpty';

const { Sider, Content } = Layout;
const { Text } = Typography;

export const ClientLayout: React.FC = () => {
    const [collapsed, setCollapsed] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [isNotificationOpen, setIsNotificationOpen] = useState(false);
    const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
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
    const streakCount = profile?.gamification.dailyStreakCount ?? 0;
    const streakMeta = getStreakDisplayMeta(streakCount);

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
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token || isTokenExpired()) {
            // Token missing or expired -> clear session and redirect
            localStorage.removeItem('token');
            localStorage.removeItem('userId');
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
        localStorage.removeItem('refreshToken');
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
                        <span>🔔</span>
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
                    <span>✅ Đã bật thông báo trên trình duyệt</span>
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
                    ⚠️ Thông báo trên trình duyệt đang bị chặn. Bấm vào icon ổ khóa 🔒 trên thanh địa chỉ để cho phép lại.
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
            key: '/app/dictation',
            icon: <CustomerServiceOutlined />,
            label: 'Chép chính tả',
        },
        {
            key: '/app/flashcards',
            icon: <ThunderboltOutlined />,
            label: 'Flashcard Từ vựng',
        },
        {
            key: '/app/progress',
            icon: <RiseOutlined />,
            label: 'Tiến trình học',
        },
        {
            key: '/app/leaderboard',
            icon: <TrophyOutlined />,
            label: 'Bảng xếp hạng',
        },
        {
            key: '/app/news',
            icon: <GlobalOutlined />,
            label: 'Tin tức thế giới',
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
        <Layout style={{ minHeight: '100vh' }}>
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
                            background: streakMeta.background,
                            border: `1px solid ${streakMeta.borderColor}`,
                            borderRadius: 14,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            boxShadow: streakMeta.shadow,
                        }}>
                            <div style={{
                                width: 36,
                                height: 36,
                                borderRadius: 10,
                                background: streakMeta.iconBackground,
                                color: streakMeta.iconColor,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: streakCount >= 14 ? 19 : 16,
                                boxShadow: streakCount > 0 ? `0 10px 18px ${streakMeta.accent}33` : undefined,
                            }}>
                                {streakMeta.icon}
                            </div>
                            <div>
                                <Text strong style={{ fontSize: 13, display: 'block', lineHeight: 1.3, color: '#0f172a' }}>
                                    {streakMeta.title}
                                </Text>
                                <Text style={{ fontSize: 11, color: '#64748b' }}>{streakMeta.description}</Text>
                            </div>
                        </div>
                    )}

                    <Menu
                        mode="inline"
                        selectedKeys={[location.pathname.startsWith('/app/flashcards') ? '/app/flashcards' : location.pathname]}
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
                        {/* Nút Báo lỗi (Pill button with badge & icon) */}
                        <button
                            type="button"
                            onClick={() => setIsFeedbackModalOpen(true)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '5px 14px 5px 8px',
                                borderRadius: 9999,
                                background: '#0f172a',
                                border: '1px solid #1e293b',
                                color: '#ffffff',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'translateY(-1px)';
                                e.currentTarget.style.borderColor = '#f97316';
                                e.currentTarget.style.boxShadow = '0 4px 14px rgba(249, 115, 22, 0.25)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.borderColor = '#1e293b';
                                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
                            }}
                            title="Gửi phản hồi & Báo lỗi"
                        >
                            <div style={{ position: 'relative', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <rect x="3" y="6" width="18" height="14" rx="4" fill="#1e293b" stroke="#f97316" strokeWidth="1.5"/>
                                    <path d="M7 6V3M17 6V3" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round"/>
                                    <circle cx="8.5" cy="12.5" r="1.5" fill="#f97316"/>
                                    <circle cx="15.5" cy="12.5" r="1.5" fill="#f97316"/>
                                    <path d="M10.5 15.5C11 16 13 16 13.5 15.5" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round"/>
                                </svg>
                                <span
                                    style={{
                                        position: 'absolute',
                                        top: -3,
                                        right: -3,
                                        width: 13,
                                        height: 13,
                                        borderRadius: '50%',
                                        background: '#f97316',
                                        color: '#ffffff',
                                        fontSize: 9,
                                        fontWeight: 900,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        boxShadow: '0 0 8px rgba(249, 115, 22, 0.8)',
                                        border: '1.5px solid #0f172a',
                                    }}
                                >
                                    !
                                </span>
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.01em', color: '#f8fafc' }}>
                                Báo lỗi
                            </span>
                        </button>
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
                                    style={{ fontSize: 16 }}
                                />
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
            <FeedbackModal
                open={isFeedbackModalOpen}
                onClose={() => setIsFeedbackModalOpen(false)}
            />
        </Layout>
    );
};
