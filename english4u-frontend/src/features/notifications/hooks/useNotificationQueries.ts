import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    notificationService,
    notificationApi,
    clientNotificationApi,
} from '../services/notification.service';
import type {
    NotificationPagedRequest,
    UpdateNotificationRequest,
    BroadcastNotificationRequest,
    ClientNotificationPagedRequest,
} from '../types/notification.types';

export { notificationService, notificationApi, clientNotificationApi };

export interface LiveQueryOptions {
    refetchInterval?: number | false;
    refetchOnWindowFocus?: boolean;
    refetchIntervalInBackground?: boolean;
    enabled?: boolean;
}

/**
 * Notification Query Keys Factory
 * Matches the enterprise pattern from Mebifarm CMS (web)
 */
export const notificationQueryKeys = {
    adminAll: ['admin', 'notifications'] as const,
    adminList: (params: NotificationPagedRequest) => ['admin', 'notifications', 'list', params] as const,
    adminStats: ['admin', 'notifications', 'stats'] as const,
    clientAll: ['client', 'notifications'] as const,
    clientList: (params: ClientNotificationPagedRequest) => ['client', 'notifications', 'list', params] as const,
    clientStats: ['client', 'notifications', 'stats'] as const,
};

// Aliases for backwards compatibility
export const notificationKeys = {
    list: notificationQueryKeys.adminList,
    stats: notificationQueryKeys.adminStats,
};

export const clientNotificationKeys = {
    list: notificationQueryKeys.clientList,
    stats: notificationQueryKeys.clientStats,
};

// ----------------- Admin Queries & Mutations -----------------

export const useAdminNotificationsQuery = (params: NotificationPagedRequest, options?: LiveQueryOptions) =>
    useQuery({
        queryKey: notificationQueryKeys.adminList(params),
        queryFn: () => notificationService.getPagedNotifications(params),
        enabled: options?.enabled ?? true,
        refetchInterval: options?.refetchInterval ?? false,
        refetchOnWindowFocus: options?.refetchOnWindowFocus ?? true,
        refetchIntervalInBackground: options?.refetchIntervalInBackground ?? false,
    });

export const useAdminNotificationStatsQuery = (options?: LiveQueryOptions) =>
    useQuery({
        queryKey: notificationQueryKeys.adminStats,
        queryFn: notificationService.getNotificationStats,
        enabled: options?.enabled ?? true,
        refetchInterval: options?.refetchInterval ?? false,
        refetchOnWindowFocus: options?.refetchOnWindowFocus ?? true,
        refetchIntervalInBackground: options?.refetchIntervalInBackground ?? false,
    });

export const useBroadcastNotificationMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: BroadcastNotificationRequest) => notificationService.broadcastNotification(payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: notificationQueryKeys.adminAll });
        },
    });
};

export const useUpdateNotificationMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: UpdateNotificationRequest }) =>
            notificationService.updateNotification(id, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: notificationQueryKeys.adminAll });
        },
    });
};

export const useDeleteNotificationMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => notificationService.deleteNotification(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: notificationQueryKeys.adminAll });
        },
    });
};

// ----------------- Client Queries & Mutations -----------------

export const useClientNotificationsQuery = (params: ClientNotificationPagedRequest, options?: LiveQueryOptions) =>
    useQuery({
        queryKey: notificationQueryKeys.clientList(params),
        queryFn: () => notificationService.getMyNotifications(params),
        enabled: options?.enabled ?? true,
        refetchInterval: options?.refetchInterval ?? false,
        refetchOnWindowFocus: options?.refetchOnWindowFocus ?? true,
        refetchIntervalInBackground: options?.refetchIntervalInBackground ?? false,
    });

export const useClientNotificationStatsQuery = (options?: LiveQueryOptions) =>
    useQuery({
        queryKey: notificationQueryKeys.clientStats,
        queryFn: notificationService.getMyNotificationStats,
        enabled: options?.enabled ?? true,
        refetchInterval: options?.refetchInterval ?? false,
        refetchOnWindowFocus: options?.refetchOnWindowFocus ?? true,
        refetchIntervalInBackground: options?.refetchIntervalInBackground ?? false,
    });

export const useUpdateClientNotificationReadMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, isRead }: { id: string; isRead: boolean }) =>
            notificationService.updateClientReadStatus(id, isRead),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: notificationQueryKeys.clientAll });
        },
    });
};

export const useMarkAllClientNotificationsReadMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: notificationService.markAllClientAsRead,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: notificationQueryKeys.clientAll });
        },
    });
};

