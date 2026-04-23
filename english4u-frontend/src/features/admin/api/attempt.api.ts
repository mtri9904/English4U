import { axiosInstance } from '@/apis/axios.instance';
import { useQuery } from '@tanstack/react-query';
import type { AdminAttemptDetailDto, AdminAttemptListItemDto } from '../types/attempt.types';

export interface AdminAttemptQueryParams {
    status?: string;
    search?: string;
}

export const attemptKeys = {
    all: ['admin', 'attempts'] as const,
    list: (params: AdminAttemptQueryParams) => ['admin', 'attempts', 'list', params] as const,
    detail: (sessionId: string) => ['admin', 'attempts', 'detail', sessionId] as const,
};

export const attemptApi = {
    getList: async (params: AdminAttemptQueryParams): Promise<AdminAttemptListItemDto[]> => {
        const response = await axiosInstance.get<AdminAttemptListItemDto[]>('/admin/attempts', { params });
        return response.data;
    },
    getDetail: async (sessionId: string): Promise<AdminAttemptDetailDto> => {
        const response = await axiosInstance.get<AdminAttemptDetailDto>(`/admin/attempts/${sessionId}`, {
            timeout: 60 * 1000,
        });
        return response.data;
    },
};

export const useAdminAttemptsQuery = (params: AdminAttemptQueryParams) =>
    useQuery({
        queryKey: attemptKeys.list(params),
        queryFn: () => attemptApi.getList(params),
    });

export const useAdminAttemptDetailQuery = (sessionId: string, enabled = true) =>
    useQuery({
        queryKey: attemptKeys.detail(sessionId),
        queryFn: () => attemptApi.getDetail(sessionId),
        enabled: enabled && !!sessionId,
        retry: false,
    });
