import { axiosInstance } from '@/apis/axios.instance';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
    BroadcastNotificationRequest,
    NotificationMutationResult,
    NotificationPagedRequest,
    NotificationPagedResult,
    NotificationStatsDto,
    UpdateNotificationRequest,
} from '../types/notification.types';

export * from '../types/notification.types';

export const notificationKeys = {
    list: (params: NotificationPagedRequest) => ['admin', 'notifications', 'list', params] as const,
    stats: ['admin', 'notifications', 'stats'] as const,
};

interface LiveQueryOptions {
    refetchInterval?: number | false;
    refetchOnWindowFocus?: boolean;
    refetchIntervalInBackground?: boolean;
    enabled?: boolean;
}

export const notificationApi = {
    getPagedNotifications: async (params: NotificationPagedRequest): Promise<NotificationPagedResult> => {
        const res = await axiosInstance.get<NotificationPagedResult>('admin/notifications', { params });
        return res.data;
    },
    getNotificationStats: async (): Promise<NotificationStatsDto> => {
        const res = await axiosInstance.get<NotificationStatsDto>('admin/notifications/stats');
        return res.data;
    },
    broadcastNotification: async (payload: BroadcastNotificationRequest): Promise<NotificationMutationResult> => {
        const res = await axiosInstance.post<NotificationMutationResult>('admin/notifications/broadcast', payload);
        return res.data;
    },
    updateNotification: async (id: string, payload: UpdateNotificationRequest): Promise<NotificationMutationResult> => {
        const res = await axiosInstance.patch<NotificationMutationResult>(`admin/notifications/${id}`, payload);
        return res.data;
    },
    deleteNotification: async (id: string): Promise<NotificationMutationResult> => {
        const res = await axiosInstance.delete<NotificationMutationResult>(`admin/notifications/${id}`);
        return res.data;
    },
    updateReadStatus: async (id: string, isRead: boolean): Promise<void> => {
        await axiosInstance.patch(`admin/notifications/${id}/read`, { isRead });
    },
    markAllRead: async (): Promise<{ updatedCount?: number; message: string }> => {
        const res = await axiosInstance.patch<{ updatedCount?: number; message: string }>('admin/notifications/mark-all-read');
        return res.data;
    },
};

export const useAdminNotificationsQuery = (params: NotificationPagedRequest, options?: LiveQueryOptions) =>
    useQuery({
        queryKey: notificationKeys.list(params),
        queryFn: () => notificationApi.getPagedNotifications(params),
        enabled: options?.enabled ?? true,
        refetchInterval: options?.refetchInterval ?? false,
        refetchOnWindowFocus: options?.refetchOnWindowFocus ?? true,
        refetchIntervalInBackground: options?.refetchIntervalInBackground ?? false,
    });

export const useAdminNotificationStatsQuery = (options?: LiveQueryOptions) =>
    useQuery({
        queryKey: notificationKeys.stats,
        queryFn: notificationApi.getNotificationStats,
        enabled: options?.enabled ?? true,
        refetchInterval: options?.refetchInterval ?? false,
        refetchOnWindowFocus: options?.refetchOnWindowFocus ?? true,
        refetchIntervalInBackground: options?.refetchIntervalInBackground ?? false,
    });

export const useBroadcastNotificationMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: notificationApi.broadcastNotification,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'notifications'] });
        },
    });
};

export const useUpdateNotificationMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: UpdateNotificationRequest }) =>
            notificationApi.updateNotification(id, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'notifications'] });
        },
    });
};

export const useDeleteNotificationMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => notificationApi.deleteNotification(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'notifications'] });
        },
    });
};

export const useUpdateNotificationReadMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, isRead }: { id: string; isRead: boolean }) => notificationApi.updateReadStatus(id, isRead),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'notifications'] });
        },
    });
};

export const useMarkAllNotificationsReadMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: notificationApi.markAllRead,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'notifications'] });
        },
    });
};
