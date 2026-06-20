import { axiosInstance } from '@/apis/axios.instance';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
    UserProfileDto,
    UpdateProfileRequest,
    ChangePasswordRequest,
    UserOverviewDto,
    UserDetailDto,
    UserManagementStatsDto,
    UserPagedRequest,
    PagedResult
} from '../types/user.types';

export * from '../types/user.types';

export const userKeys = {
    profile: ['user', 'profile'] as const,
    adminStats: ['admin', 'users', 'stats'] as const,
    adminList: (params: UserPagedRequest) => ['admin', 'users', 'list', params] as const,
    adminDetail: (id: string) => ['admin', 'users', 'detail', id] as const,
};

interface LiveQueryOptions {
    refetchInterval?: number | false;
    refetchOnWindowFocus?: boolean;
    refetchIntervalInBackground?: boolean;
    enabled?: boolean;
}

export const userApi = {
    getProfile: async (): Promise<UserProfileDto> => {
        const res = await axiosInstance.get<UserProfileDto>('user/profile');
        return res.data;
    },
    updateProfile: async (data: UpdateProfileRequest): Promise<void> => {
        await axiosInstance.put('user/profile', data);
    },
    changePassword: async (data: ChangePasswordRequest): Promise<void> => {
        await axiosInstance.put('user/change-password', data);
    },
    heartbeat: async (): Promise<void> => {
        await axiosInstance.post('user/activity/heartbeat');
    },
    markOffline: async (): Promise<void> => {
        await axiosInstance.post('user/activity/offline');
    },

    getAdminStats: async (): Promise<UserManagementStatsDto> => {
        const res = await axiosInstance.get<UserManagementStatsDto>('admin/users/stats');
        return res.data;
    },
    getAdminPagedUsers: async (params: UserPagedRequest): Promise<PagedResult<UserOverviewDto>> => {
        const res = await axiosInstance.get<PagedResult<UserOverviewDto>>('admin/users', { params });
        return res.data;
    },
    getAdminUserDetail: async (id: string): Promise<UserDetailDto> => {
        const res = await axiosInstance.get<UserDetailDto>(`admin/users/${id}`);
        return res.data;
    },
    toggleAdminUserStatus: async (id: string, isActive: boolean): Promise<void> => {
        await axiosInstance.patch(`admin/users/${id}/status`, { isActive });
    },
    deleteSelfAccount: async (): Promise<void> => {
        await axiosInstance.delete('user');
    },
    deleteAdminUser: async (id: string): Promise<void> => {
        await axiosInstance.delete(`admin/users/${id}`);
    },
    updateAdminUserRole: async (id: string, roleName: string): Promise<void> => {
        await axiosInstance.patch(`admin/users/${id}/role`, { roleName });
    },
};

export const useUserProfileQuery = () =>
    useQuery({
        queryKey: userKeys.profile,
        queryFn: userApi.getProfile,
    });

export const useAdminStatsQuery = (options?: LiveQueryOptions) =>
    useQuery({
        queryKey: userKeys.adminStats,
        queryFn: userApi.getAdminStats,
        enabled: options?.enabled ?? true,
        refetchInterval: options?.refetchInterval ?? false,
        refetchOnWindowFocus: options?.refetchOnWindowFocus ?? true,
        refetchIntervalInBackground: options?.refetchIntervalInBackground ?? false,
    });

export const useAdminUsersQuery = (params: UserPagedRequest, options?: LiveQueryOptions) =>
    useQuery({
        queryKey: userKeys.adminList(params),
        queryFn: () => userApi.getAdminPagedUsers(params),
        enabled: options?.enabled ?? true,
        refetchInterval: options?.refetchInterval ?? false,
        refetchOnWindowFocus: options?.refetchOnWindowFocus ?? true,
        refetchIntervalInBackground: options?.refetchIntervalInBackground ?? false,
    });

export const useAdminUserDetailQuery = (id: string, enabled = true, options?: LiveQueryOptions) =>
    useQuery({
        queryKey: userKeys.adminDetail(id),
        queryFn: () => userApi.getAdminUserDetail(id),
        enabled: !!id && enabled && (options?.enabled ?? true),
        refetchInterval: options?.refetchInterval ?? false,
        refetchOnWindowFocus: options?.refetchOnWindowFocus ?? true,
        refetchIntervalInBackground: options?.refetchIntervalInBackground ?? false,
    });

export const useUpdateProfileMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: userApi.updateProfile,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.profile }),
    });
};

export const useToggleUserStatusMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
            userApi.toggleAdminUserStatus(id, isActive),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
        },
    });
};

export const useChangePasswordMutation = () => {
    return useMutation({
        mutationFn: userApi.changePassword,
    });
};

export const useDeleteSelfAccountMutation = () => {
    return useMutation({
        mutationFn: userApi.deleteSelfAccount,
    });
};

export const useDeleteAdminUserMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: userApi.deleteAdminUser,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
        },
    });
};

export const useUpdateUserRoleMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, roleName }: { id: string; roleName: string }) =>
            userApi.updateAdminUserRole(id, roleName),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
        },
    });
};

export const useHeartbeatMutation = () => {
    return useMutation({
        mutationFn: userApi.heartbeat,
    });
};

export const useMarkOfflineMutation = () => {
    return useMutation({
        mutationFn: userApi.markOffline,
    });
};
