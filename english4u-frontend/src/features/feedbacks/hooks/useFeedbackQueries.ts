import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { feedbackService } from '../services/feedback.service';
import type {
    CreateFeedbackRequest,
    FeedbackPagedRequest,
    UpdateFeedbackStatusRequest,
} from '../types/feedback.types';

export const FEEDBACK_QUERY_KEYS = {
    RECENT: ['feedbacks', 'recent'] as const,
    MY: ['feedbacks', 'my'] as const,
    DETAIL: (id?: string) => ['feedbacks', 'detail', id] as const,
    ADMIN_PAGED: (params: FeedbackPagedRequest) => ['admin', 'feedbacks', params] as const,
    ADMIN_STATS: ['admin', 'feedbacks', 'stats'] as const,
};

export const useRecentFeedbacksQuery = (options?: { enabled?: boolean; limit?: number }) => {
    return useQuery({
        queryKey: [...FEEDBACK_QUERY_KEYS.RECENT, options?.limit ?? 20],
        queryFn: () => feedbackService.getRecentFeedbacks(options?.limit ?? 20),
        enabled: options?.enabled ?? true,
        staleTime: 10_000,
    });
};

export const useMyFeedbacksQuery = (options?: { enabled?: boolean; limit?: number }) => {
    return useQuery({
        queryKey: [...FEEDBACK_QUERY_KEYS.MY, options?.limit ?? 20],
        queryFn: () => feedbackService.getMyFeedbacks(options?.limit ?? 20),
        enabled: options?.enabled ?? true,
        staleTime: 10_000,
    });
};

export const useFeedbackDetailQuery = (id?: string, options?: { enabled?: boolean }) => {
    return useQuery({
        queryKey: FEEDBACK_QUERY_KEYS.DETAIL(id),
        queryFn: () => {
            if (!id) throw new Error('Feedback ID is required');
            return feedbackService.getFeedbackById(id);
        },
        enabled: (options?.enabled ?? true) && !!id,
    });
};

export const useCreateFeedbackMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: CreateFeedbackRequest) => feedbackService.createFeedback(payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: FEEDBACK_QUERY_KEYS.RECENT });
            queryClient.invalidateQueries({ queryKey: FEEDBACK_QUERY_KEYS.MY });
            queryClient.invalidateQueries({ queryKey: ['admin', 'feedbacks'] });
        },
    });
};

export const useUploadFeedbackImageMutation = () => {
    return useMutation({
        mutationFn: (file: File) => feedbackService.uploadFeedbackImage(file),
    });
};

export const useAdminFeedbacksQuery = (params: FeedbackPagedRequest, options?: { enabled?: boolean }) => {
    return useQuery({
        queryKey: FEEDBACK_QUERY_KEYS.ADMIN_PAGED(params),
        queryFn: () => feedbackService.getAdminPagedFeedbacks(params),
        enabled: options?.enabled ?? true,
        staleTime: 5_000,
    });
};

export const useAdminFeedbackStatsQuery = (options?: { enabled?: boolean }) => {
    return useQuery({
        queryKey: FEEDBACK_QUERY_KEYS.ADMIN_STATS,
        queryFn: () => feedbackService.getAdminFeedbackStats(),
        enabled: options?.enabled ?? true,
        staleTime: 15_000,
    });
};

export const useUpdateFeedbackStatusMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: UpdateFeedbackStatusRequest }) =>
            feedbackService.updateFeedbackStatus(id, payload),
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: FEEDBACK_QUERY_KEYS.DETAIL(variables.id) });
            queryClient.invalidateQueries({ queryKey: FEEDBACK_QUERY_KEYS.RECENT });
            queryClient.invalidateQueries({ queryKey: FEEDBACK_QUERY_KEYS.MY });
            queryClient.invalidateQueries({ queryKey: ['admin', 'feedbacks'] });
        },
    });
};

export const useDeleteFeedbackMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => feedbackService.deleteFeedback(id),
        onSuccess: (_data, id) => {
            queryClient.removeQueries({ queryKey: FEEDBACK_QUERY_KEYS.DETAIL(id) });
            queryClient.invalidateQueries({ queryKey: FEEDBACK_QUERY_KEYS.RECENT });
            queryClient.invalidateQueries({ queryKey: FEEDBACK_QUERY_KEYS.MY });
            queryClient.invalidateQueries({ queryKey: ['admin', 'feedbacks'] });
            queryClient.invalidateQueries({ queryKey: FEEDBACK_QUERY_KEYS.ADMIN_STATS });
        },
    });
};

