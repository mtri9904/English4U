import { callApi } from '@/apis/handleApi';
import { ApiRouters } from '@/constants/api-routes';
import type {
    BroadcastNotificationRequest,
    NotificationMutationResult,
    NotificationPagedRequest,
    NotificationPagedResult,
    NotificationStatsDto,
    UpdateNotificationRequest,
    ClientNotificationPagedRequest,
    ClientNotificationPagedResult,
    ClientNotificationStatsDto,
} from '../types/notification.types';

/**
 * Notification Service
 * Follows the enterprise pattern from Mebifarm CMS (web)
 * Centralizes all admin & client notification API calls
 */
export const notificationService = {
    // ----------------- Admin Operations -----------------
    getPagedNotifications: async (params: NotificationPagedRequest): Promise<NotificationPagedResult> => {
        return callApi<NotificationPagedResult>(ApiRouters.NOTIFICATION.ADMIN_BASE, params, 'get');
    },

    getNotificationStats: async (): Promise<NotificationStatsDto> => {
        return callApi<NotificationStatsDto>(ApiRouters.NOTIFICATION.ADMIN_STATS, undefined, 'get');
    },

    broadcastNotification: async (payload: BroadcastNotificationRequest): Promise<NotificationMutationResult> => {
        return callApi<NotificationMutationResult>(ApiRouters.NOTIFICATION.ADMIN_BROADCAST, payload, 'post');
    },

    updateNotification: async (id: string, payload: UpdateNotificationRequest): Promise<NotificationMutationResult> => {
        return callApi<NotificationMutationResult>(ApiRouters.NOTIFICATION.ADMIN_BY_ID(id), payload, 'patch');
    },

    deleteNotification: async (id: string): Promise<NotificationMutationResult> => {
        return callApi<NotificationMutationResult>(ApiRouters.NOTIFICATION.ADMIN_BY_ID(id), undefined, 'delete');
    },

    updateReadStatus: async (id: string, isRead: boolean): Promise<void> => {
        return callApi<void>(ApiRouters.NOTIFICATION.ADMIN_READ(id), { isRead }, 'patch');
    },

    markAllRead: async (): Promise<{ updatedCount?: number; message: string }> => {
        return callApi<{ updatedCount?: number; message: string }>(
            ApiRouters.NOTIFICATION.ADMIN_MARK_ALL_READ,
            undefined,
            'patch'
        );
    },

    // ----------------- Client Operations -----------------
    getMyNotifications: async (params: ClientNotificationPagedRequest): Promise<ClientNotificationPagedResult> => {
        return callApi<ClientNotificationPagedResult>(ApiRouters.NOTIFICATION.CLIENT_MY, params, 'get');
    },

    getMyNotificationStats: async (): Promise<ClientNotificationStatsDto> => {
        return callApi<ClientNotificationStatsDto>(ApiRouters.NOTIFICATION.CLIENT_STATS, undefined, 'get');
    },

    updateClientReadStatus: async (id: string, isRead: boolean): Promise<void> => {
        return callApi<void>(ApiRouters.NOTIFICATION.CLIENT_READ(id), { isRead }, 'patch');
    },

    markAllClientAsRead: async (): Promise<{ updatedCount?: number; message: string }> => {
        return callApi<{ updatedCount?: number; message: string }>(
            ApiRouters.NOTIFICATION.CLIENT_MARK_ALL_READ,
            undefined,
            'patch'
        );
    },
};

// Aliases for backwards compatibility
export const notificationApi = notificationService;
export const clientNotificationApi = {
    getMyNotifications: notificationService.getMyNotifications,
    getMyNotificationStats: notificationService.getMyNotificationStats,
    updateReadStatus: notificationService.updateClientReadStatus,
    markAllAsRead: notificationService.markAllClientAsRead,
};

