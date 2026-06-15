import { axiosInstance } from '@/apis/axios.instance';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface ClientNotificationItemDto {
    id: string;
    title: string;
    message: string | null;
    isRead: boolean;
    createdAt: string;
}

export interface ClientNotificationPagedRequest {
    pageNumber?: number;
    pageSize?: number;
}

export interface ClientNotificationPagedResult {
    items: ClientNotificationItemDto[];
    totalCount: number;
    pageNumber: number;
    pageSize: number;
}

export interface ClientNotificationStatsDto {
    total: number;
    unread: number;
}

interface LiveQueryOptions {
    refetchInterval?: number | false;
    refetchOnWindowFocus?: boolean;
    refetchIntervalInBackground?: boolean;
    enabled?: boolean;
}

export const clientNotificationKeys = {
    list: (params: ClientNotificationPagedRequest) => ['client', 'notifications', 'list', params] as const,
    stats: ['client', 'notifications', 'stats'] as const,
};

export const clientNotificationApi = {
    getMyNotifications: async (params: ClientNotificationPagedRequest): Promise<ClientNotificationPagedResult> => {
        const res = await axiosInstance.get<ClientNotificationPagedResult>('notifications/my', { params });
        return res.data;
    },
    getMyNotificationStats: async (): Promise<ClientNotificationStatsDto> => {
        const res = await axiosInstance.get<ClientNotificationStatsDto>('notifications/my/stats');
        return res.data;
    },
    updateReadStatus: async (id: string, isRead: boolean): Promise<void> => {
        await axiosInstance.patch(`notifications/${id}/read`, { isRead });
    },
    markAllAsRead: async (): Promise<{ updatedCount?: number; message: string }> => {
        const res = await axiosInstance.patch<{ updatedCount?: number; message: string }>('notifications/my/mark-all-read');
        return res.data;
    },
};

export const useClientNotificationsQuery = (params: ClientNotificationPagedRequest, options?: LiveQueryOptions) =>
    useQuery({
        queryKey: clientNotificationKeys.list(params),
        queryFn: () => clientNotificationApi.getMyNotifications(params),
        enabled: options?.enabled ?? true,
        refetchInterval: options?.refetchInterval ?? false,
        refetchOnWindowFocus: options?.refetchOnWindowFocus ?? true,
        refetchIntervalInBackground: options?.refetchIntervalInBackground ?? false,
    });

export const useClientNotificationStatsQuery = (options?: LiveQueryOptions) =>
    useQuery({
        queryKey: clientNotificationKeys.stats,
        queryFn: clientNotificationApi.getMyNotificationStats,
        enabled: options?.enabled ?? true,
        refetchInterval: options?.refetchInterval ?? false,
        refetchOnWindowFocus: options?.refetchOnWindowFocus ?? true,
        refetchIntervalInBackground: options?.refetchIntervalInBackground ?? false,
    });

export const useUpdateClientNotificationReadMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, isRead }: { id: string; isRead: boolean }) =>
            clientNotificationApi.updateReadStatus(id, isRead),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['client', 'notifications'] });
        },
    });
};

export const useMarkAllClientNotificationsReadMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: clientNotificationApi.markAllAsRead,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['client', 'notifications'] });
        },
    });
};
