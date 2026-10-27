import { callApi } from '@/apis/handleApi';
import { ApiRouters } from '@/constants/api-routes';
import type {
    UserProfileDto,
    UpdateProfileRequest,
    ChangePasswordRequest,
    UserOverviewDto,
    UserDetailDto,
    UserManagementStatsDto,
    UserPagedRequest,
    PagedResult,
} from '../types/user.types';

/**
 * Student & User Management Service
 * Follows the enterprise pattern from Mebifarm CMS (web)
 */
export const studentService = {
    // ----------------- Profile Operations -----------------
    getProfile: async (): Promise<UserProfileDto> => {
        return callApi<UserProfileDto>(ApiRouters.USER.PROFILE, undefined, 'get');
    },

    updateProfile: async (data: UpdateProfileRequest): Promise<void> => {
        return callApi<void>(ApiRouters.USER.PROFILE, data, 'put');
    },

    changePassword: async (data: ChangePasswordRequest): Promise<void> => {
        return callApi<void>('user/change-password', data, 'put');
    },

    heartbeat: async (): Promise<void> => {
        return callApi<void>('user/activity/heartbeat', undefined, 'post');
    },

    markOffline: async (): Promise<void> => {
        return callApi<void>('user/activity/offline', undefined, 'post');
    },

    deleteSelfAccount: async (): Promise<void> => {
        return callApi<void>('user', undefined, 'delete');
    },

    // ----------------- Admin Student Operations -----------------
    getAdminStats: async (): Promise<UserManagementStatsDto> => {
        return callApi<UserManagementStatsDto>('admin/users/stats', undefined, 'get');
    },

    getAdminUsers: async (params: UserPagedRequest): Promise<PagedResult<UserOverviewDto>> => {
        return callApi<PagedResult<UserOverviewDto>>('admin/users', params, 'get');
    },

    getAdminUserDetail: async (id: string): Promise<UserDetailDto> => {
        return callApi<UserDetailDto>(`admin/users/${id}`, undefined, 'get');
    },

    toggleUserStatus: async (id: string, payload: { isLocked: boolean; reason?: string }): Promise<void> => {
        return callApi<void>(`admin/users/${id}/status`, payload, 'patch');
    },

    updateUserRole: async (id: string, payload: { role: string }): Promise<void> => {
        return callApi<void>(`admin/users/${id}/role`, payload, 'patch');
    },

    deleteUser: async (id: string): Promise<void> => {
        return callApi<void>(`admin/users/${id}`, undefined, 'delete');
    },
};

// Alias for backwards compatibility
export const userApi = studentService;
