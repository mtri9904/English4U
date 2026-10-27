import { callApi } from '@/apis/handleApi';
import type { PagedResult } from '@/types/api.types';
import type { AdminAttemptDetailDto, AdminAttemptListItemDto } from '../types/attempt.types';

export interface AdminAttemptQueryParams {
    status?: string;
    search?: string;
    pageNumber?: number;
    pageSize?: number;
}

/**
 * Attempt Service
 * Follows enterprise pattern from Mebifarm CMS (web)
 */
export const attemptService = {
    getList: async (params?: AdminAttemptQueryParams): Promise<PagedResult<AdminAttemptListItemDto>> => {
        return callApi<PagedResult<AdminAttemptListItemDto>>('/admin/attempts', params, 'get');
    },

    getDetail: async (sessionId: string): Promise<AdminAttemptDetailDto> => {
        return callApi<AdminAttemptDetailDto>(`/admin/attempts/${sessionId}`, undefined, 'get', undefined, {
            timeout: 60 * 1000,
        });
    },
};

// Alias for backwards compatibility
export const attemptApi = attemptService;

