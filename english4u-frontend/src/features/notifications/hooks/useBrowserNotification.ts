import { useState, useEffect, useRef, useCallback } from 'react';
import { message } from 'antd';
import { REALTIME_BROWSER_EVENT } from '@/features/realtime/hooks/useRealtimeSync';

export type BrowserNotificationPermission = 'default' | 'granted' | 'denied' | 'unsupported';

export interface UseBrowserNotificationOptions {
    unreadCount?: number;
    latestNotification?: {
        id: string;
        title: string;
        message?: string | null;
    } | null;
    onNotificationClick?: () => void;
}

/**
 * Synthesizes a soothing, 2-tone melodic chime via Web Audio API.
 * Does not require external audio assets.
 */
export const playNotificationChime = () => {
    try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const now = ctx.currentTime;

        // Tone 1: 587.33 Hz (D5)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(587.33, now);
        gain1.gain.setValueAtTime(0.18, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.35);

        // Tone 2: 880 Hz (A5)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(880, now + 0.12);
        gain2.gain.setValueAtTime(0.22, now + 0.12);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.12);
        osc2.stop(now + 0.6);
    } catch {
        // Audio playback may be restricted before initial user gesture
    }
};

export const useBrowserNotification = (options: UseBrowserNotificationOptions = {}) => {
    const { unreadCount, latestNotification, onNotificationClick } = options;

    const [permission, setPermission] = useState<BrowserNotificationPermission>(() => {
        if (typeof window === 'undefined' || !('Notification' in window)) {
            return 'unsupported';
        }
        return Notification.permission as BrowserNotificationPermission;
    });

    const [isRinging, setIsRinging] = useState(false);
    const ringTimeoutRef = useRef<number | null>(null);
    const prevUnreadRef = useRef<number | undefined>(undefined);
    const lastNotifiedIdRef = useRef<string | null>(null);

    // Stop ring timer helper
    const stopRinging = useCallback(() => {
        if (ringTimeoutRef.current !== null) {
            window.clearTimeout(ringTimeoutRef.current);
            ringTimeoutRef.current = null;
        }
        setIsRinging(false);
    }, []);

    // Trigger bell animation for a specified duration
    const triggerBellRing = useCallback((durationMs = 4500) => {
        stopRinging();
        setIsRinging(true);
        ringTimeoutRef.current = window.setTimeout(() => {
            setIsRinging(false);
            ringTimeoutRef.current = null;
        }, durationMs);
    }, [stopRinging]);

    // Request browser notification permission
    const requestPermission = useCallback(async (): Promise<BrowserNotificationPermission> => {
        if (typeof window === 'undefined' || !('Notification' in window)) {
            message.info('Trình duyệt của bạn hiện không hỗ trợ Web Notification.');
            return 'unsupported';
        }

        try {
            const result = (await Notification.requestPermission()) as BrowserNotificationPermission;
            setPermission(result);

            if (result === 'granted') {
                message.success('Đã bật thông báo trên trình duyệt thành công!');
                playNotificationChime();
                triggerBellRing(3000);

                // Show a welcome test notification
                const notif = new Notification('English4U - Đã kích hoạt thông báo 🎉', {
                    body: 'Bạn sẽ nhận được thông báo ngay khi có bài thi, tin tức hoặc cập nhật mới.',
                    icon: '/logo/Logo.png',
                    tag: 'welcome-notification',
                });
                notif.onclick = () => {
                    window.focus();
                    onNotificationClick?.();
                    notif.close();
                };
            } else if (result === 'denied') {
                message.warning('Bạn đã chặn thông báo. Bạn có thể mở lại bằng cách bấm vào biểu tượng ổ khóa cạnh URL.');
            }

            return result;
        } catch {
            return 'denied';
        }
    }, [onNotificationClick, triggerBellRing]);

    // Display a desktop browser notification
    const showNotification = useCallback(
        (title: string, notifOptions?: NotificationOptions & { onClick?: () => void }) => {
            if (typeof window === 'undefined' || !('Notification' in window)) {
                return null;
            }

            if (Notification.permission !== 'granted') {
                return null;
            }

            try {
                playNotificationChime();
                triggerBellRing(4000);

                const notif = new Notification(title, {
                    icon: '/logo/Logo.png',
                    badge: '/logo/Logo.png',
                    ...notifOptions,
                });

                notif.onclick = () => {
                    window.focus();
                    if (notifOptions?.onClick) {
                        notifOptions.onClick();
                    } else if (onNotificationClick) {
                        onNotificationClick();
                    }
                    notif.close();
                };

                return notif;
            } catch {
                return null;
            }
        },
        [onNotificationClick, triggerBellRing]
    );

    // Watch for unread count increases to trigger bell ringing and desktop notification
    useEffect(() => {
        if (unreadCount === undefined) return;

        // Skip on first mount to avoid ringing on initial load
        if (prevUnreadRef.current === undefined) {
            prevUnreadRef.current = unreadCount;
            if (latestNotification) {
                lastNotifiedIdRef.current = latestNotification.id;
            }
            return;
        }

        if (unreadCount > prevUnreadRef.current) {
            triggerBellRing(5000);
            playNotificationChime();

            if (permission === 'granted' && latestNotification && latestNotification.id !== lastNotifiedIdRef.current) {
                lastNotifiedIdRef.current = latestNotification.id;
                showNotification(latestNotification.title || 'English4U - Thông báo mới 🔔', {
                    body: latestNotification.message || 'Bạn vừa nhận được một thông báo mới từ hệ thống.',
                    tag: latestNotification.id,
                });
            }
        }

        prevUnreadRef.current = unreadCount;
    }, [unreadCount, latestNotification, permission, triggerBellRing, showNotification]);

    // Listen to real-time WebSocket events
    useEffect(() => {
        const handleRealtimeEvent = (event: Event) => {
            const customEvent = event as CustomEvent<{ type?: string }>;
            if (customEvent.detail?.type === 'notifications.changed') {
                triggerBellRing(5000);
                playNotificationChime();
            }
        };

        window.addEventListener(REALTIME_BROWSER_EVENT, handleRealtimeEvent);
        return () => {
            window.removeEventListener(REALTIME_BROWSER_EVENT, handleRealtimeEvent);
            if (ringTimeoutRef.current !== null) {
                window.clearTimeout(ringTimeoutRef.current);
            }
        };
    }, [triggerBellRing]);

    return {
        permission,
        isSupported: permission !== 'unsupported',
        isRinging,
        requestPermission,
        showNotification,
        triggerBellRing,
        stopRinging,
        playChime: playNotificationChime,
    };
};

