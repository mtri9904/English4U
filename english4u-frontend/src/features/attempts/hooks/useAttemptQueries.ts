import { useQuery } from '@tanstack/react-query';
import { attemptService, attemptApi, type AdminAttemptQueryParams } from '../services/attempt.service';

export { attemptService, attemptApi, type AdminAttemptQueryParams };

/**
 * Attempt Query Keys Factory
 */
export const attemptQueryKeys = {
    all: ['admin', 'attempts'] as const,
    list: (params?: AdminAttemptQueryParams) => ['admin', 'attempts', 'list', params] as const,
    detail: (sessionId: string) => ['admin', 'attempts', 'detail', sessionId] as const,
};

// Alias for backwards compatibility
export const attemptKeys = attemptQueryKeys;

export const useAdminAttemptsQuery = (params?: AdminAttemptQueryParams) =>
    useQuery({
        queryKey: attemptQueryKeys.list(params),
        queryFn: () => attemptService.getList(params),
    });

export const useAdminAttemptDetailQuery = (sessionId: string, enabled = true) =>
    useQuery({
        queryKey: attemptQueryKeys.detail(sessionId),
        queryFn: () => attemptService.getDetail(sessionId),
        enabled: enabled && !!sessionId,
        retry: false,
    });

