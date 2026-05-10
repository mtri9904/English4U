import { useEffect } from 'react';
import { userApi } from '@/features/admin/api/user.api';
import {
    SESSION_CONFLICT_MESSAGE,
    setForcedLogoutReason,
} from '@/features/auth/lib/sessionSignals';

const HEARTBEAT_INTERVAL_MS = 60_000;
const MAINTENANCE_INTERVAL_MS = 10_000;
const LEADER_TTL_MS = 70_000;
const TABS_TTL_MS = 90_000;
const LEADER_STORAGE_KEY = 'presence:heartbeat:leader';
const TABS_STORAGE_KEY = 'presence:tabs';
const API_BASE_URL = (import.meta as any).env.VITE_API_BASE_URL || 'http://localhost:5237/api';

type LeaderLease = {
    tabId: string;
    expiresAt: number;
};

const makeTabId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const TAB_ID = makeTabId();

const getAuthState = () => {
    const token = localStorage.getItem('token');
    const userId = localStorage.getItem('userId');
    return {
        token,
        userId,
        isLoggedIn: !!token && !!userId,
    };
};

const safeParseJson = <T,>(value: string | null): T | null => {
    if (!value) {
        return null;
    }

    try {
        return JSON.parse(value) as T;
    } catch {
        return null;
    }
};

const readTabs = (): Record<string, number> =>
    safeParseJson<Record<string, number>>(localStorage.getItem(TABS_STORAGE_KEY)) ?? {};

const writeTabs = (tabs: Record<string, number>) => {
    localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(tabs));
};

const pruneStaleTabs = (tabs: Record<string, number>, now: number) =>
    Object.fromEntries(
        Object.entries(tabs).filter(([, timestamp]) => now - timestamp < TABS_TTL_MS),
    );

const touchCurrentTab = () => {
    const now = Date.now();
    const tabs = pruneStaleTabs(readTabs(), now);
    tabs[TAB_ID] = now;
    writeTabs(tabs);
};

const removeCurrentTab = () => {
    const now = Date.now();
    const tabs = pruneStaleTabs(readTabs(), now);
    delete tabs[TAB_ID];
    writeTabs(tabs);
    return Object.keys(tabs).length;
};

const readLeaderLease = (): LeaderLease | null =>
    safeParseJson<LeaderLease>(localStorage.getItem(LEADER_STORAGE_KEY));

const writeLeaderLease = (lease: LeaderLease) => {
    localStorage.setItem(LEADER_STORAGE_KEY, JSON.stringify(lease));
};

const clearLeaderLeaseIfCurrent = () => {
    const lease = readLeaderLease();
    if (lease?.tabId === TAB_ID) {
        localStorage.removeItem(LEADER_STORAGE_KEY);
    }
};

const isCurrentLeader = () => {
    const lease = readLeaderLease();
    if (!lease) {
        return false;
    }

    return lease.tabId === TAB_ID && lease.expiresAt > Date.now();
};

const tryAcquireOrRenewLeadership = () => {
    const now = Date.now();
    const lease = readLeaderLease();
    if (!lease || lease.expiresAt <= now || lease.tabId === TAB_ID) {
        writeLeaderLease({
            tabId: TAB_ID,
            expiresAt: now + LEADER_TTL_MS,
        });
    }
};

const sendOfflineWithToken = (token: string | null, keepalive = false) => {
    if (!token) {
        return;
    }

    void fetch(`${API_BASE_URL}/user/activity/offline`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
        },
        keepalive,
    });
};

const sendOfflineKeepalive = () => {
    const { token, isLoggedIn } = getAuthState();
    if (!isLoggedIn) {
        return;
    }

    sendOfflineWithToken(token, true);
};

export const SessionPresenceTracker = () => {
    useEffect(() => {
        let heartbeatTimerId: number | null = null;
        let maintenanceTimerId: number | null = null;
        let hasExited = false;
        let wasLoggedIn = getAuthState().isLoggedIn;
        let activeUserId = getAuthState().userId;
        let activeToken = getAuthState().token;

        const stopTimers = () => {
            if (heartbeatTimerId !== null) {
                window.clearInterval(heartbeatTimerId);
                heartbeatTimerId = null;
            }

            if (maintenanceTimerId !== null) {
                window.clearInterval(maintenanceTimerId);
                maintenanceTimerId = null;
            }
        };

        const maintainPresenceState = () => {
            const authState = getAuthState();
            const { isLoggedIn } = authState;
            touchCurrentTab();
            wasLoggedIn = isLoggedIn;
            activeUserId = authState.userId;
            activeToken = authState.token;

            if (!isLoggedIn) {
                clearLeaderLeaseIfCurrent();
                return;
            }

            tryAcquireOrRenewLeadership();
        };

        const heartbeat = () => {
            const { isLoggedIn } = getAuthState();
            if (!isLoggedIn) {
                return;
            }

            tryAcquireOrRenewLeadership();
            if (!isCurrentLeader()) {
                return;
            }

            void userApi.heartbeat().catch(() => undefined);
        };

        const forceLogoutFromSessionConflict = () => {
            if (hasExited) {
                return;
            }

            hasExited = true;
            if (activeUserId) {
                sendOfflineWithToken(activeToken);
            }

            stopTimers();
            removeCurrentTab();
            clearLeaderLeaseIfCurrent();
            localStorage.removeItem('token');
            localStorage.removeItem('userId');
            setForcedLogoutReason(SESSION_CONFLICT_MESSAGE);
            const loginPath = window.location.pathname.startsWith('/admin') ? '/admin/login' : '/login';
            window.location.replace(loginPath);
        };

        const handleFocusOrVisible = () => {
            maintainPresenceState();
            heartbeat();
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                handleFocusOrVisible();
            }
        };

        const handleStorageChange = (event: StorageEvent) => {
            if (
                event.key === 'token' ||
                event.key === 'userId'
            ) {
                if (event.oldValue !== event.newValue && wasLoggedIn) {
                    forceLogoutFromSessionConflict();
                    return;
                }

                maintainPresenceState();
                heartbeat();
            }

            if (event.key === LEADER_STORAGE_KEY) {
                maintainPresenceState();
            }
        };

        const handlePageExit = () => {
            if (hasExited) {
                return;
            }

            hasExited = true;
            const remainingTabs = removeCurrentTab();
            clearLeaderLeaseIfCurrent();

            if (remainingTabs === 0) {
                sendOfflineKeepalive();
            }
        };

        maintainPresenceState();
        heartbeat();
        heartbeatTimerId = window.setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
        maintenanceTimerId = window.setInterval(maintainPresenceState, MAINTENANCE_INTERVAL_MS);

        window.addEventListener('focus', handleFocusOrVisible);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('storage', handleStorageChange);
        window.addEventListener('pagehide', handlePageExit);
        window.addEventListener('beforeunload', handlePageExit);

        return () => {
            stopTimers();
            removeCurrentTab();
            clearLeaderLeaseIfCurrent();
            window.removeEventListener('focus', handleFocusOrVisible);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('pagehide', handlePageExit);
            window.removeEventListener('beforeunload', handlePageExit);
        };
    }, []);

    return null;
};
