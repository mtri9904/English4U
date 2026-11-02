import { callApi } from '@/apis/handleApi';
import { ApiRouters } from '@/constants/api-routes';
import type {
    CreateFeedbackRequest,
    FeedbackDetail,
    FeedbackListItem,
    FeedbackPagedRequest,
    FeedbackPagedResult,
    FeedbackStats,
    UpdateFeedbackStatusRequest,
} from '../types/feedback.types';

export const feedbackService = {
    // ----------------- Client Endpoints -----------------
    createFeedback: async (payload: CreateFeedbackRequest): Promise<FeedbackDetail> => {
        return callApi<FeedbackDetail>(ApiRouters.FEEDBACK.BASE, payload, 'post');
    },

    uploadFeedbackImage: async (file: File): Promise<{ url: string; fileName: string }> => {
        const formData = new FormData();
        formData.append('file', file);
        return callApi<{ url: string; fileName: string }>(
            ApiRouters.FEEDBACK.UPLOAD_IMAGE,
            formData,
            'post',
            undefined,
            {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            }
        );
    },

    getRecentFeedbacks: async (limit: number = 20): Promise<FeedbackListItem[]> => {
        return callApi<FeedbackListItem[]>(ApiRouters.FEEDBACK.RECENT, { limit }, 'get');
    },

    getMyFeedbacks: async (limit: number = 20): Promise<FeedbackListItem[]> => {
        return callApi<FeedbackListItem[]>(ApiRouters.FEEDBACK.MY, { limit }, 'get');
    },

    getFeedbackById: async (id: string): Promise<FeedbackDetail> => {
        return callApi<FeedbackDetail>(ApiRouters.FEEDBACK.BY_ID(id), undefined, 'get');
    },

    // ----------------- Admin Endpoints -----------------
    getAdminPagedFeedbacks: async (params: FeedbackPagedRequest): Promise<FeedbackPagedResult> => {
        return callApi<FeedbackPagedResult>(ApiRouters.FEEDBACK.ADMIN_BASE, params, 'get');
    },

    getAdminFeedbackStats: async (): Promise<FeedbackStats> => {
        return callApi<FeedbackStats>(ApiRouters.FEEDBACK.ADMIN_STATS, undefined, 'get');
    },

    updateFeedbackStatus: async (
        id: string,
        payload: UpdateFeedbackStatusRequest
    ): Promise<FeedbackDetail> => {
        return callApi<FeedbackDetail>(ApiRouters.FEEDBACK.ADMIN_UPDATE_STATUS(id), payload, 'patch');
    },

    deleteFeedback: async (id: string): Promise<{ message: string }> => {
        return callApi<{ message: string }>(ApiRouters.FEEDBACK.ADMIN_DELETE(id), undefined, 'delete');
    },
};

