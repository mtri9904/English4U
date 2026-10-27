import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { studentService, userApi } from '../services/student.service';
import type {
    UpdateProfileRequest,
    ChangePasswordRequest,
    UserPagedRequest,
} from '../types/user.types';

export { studentService, userApi };

export interface LiveQueryOptions {
    refetchInterval?: number | false;
    refetchOnWindowFocus?: boolean;
    refetchIntervalInBackground?: boolean;
    enabled?: boolean;
}

/**
 * Student & User Query Keys Factory
 * Matches the enterprise pattern from Mebifarm CMS (web)
 */
export const studentQueryKeys = {
    profile: ['user', 'profile'] as const,
    adminStats: ['admin', 'users', 'stats'] as const,
    adminList: (params: UserPagedRequest) => ['admin', 'users', 'list', params] as const,
    adminDetail: (id: string) => ['admin', 'users', 'detail', id] as const,
};

// Alias for backwards compatibility
export const userKeys = studentQueryKeys;

// ----------------- Profile Queries & Mutations -----------------

export const useUserProfileQuery = () =>
    useQuery({
        queryKey: studentQueryKeys.profile,
        queryFn: studentService.getProfile,
    });

export const useUpdateProfileMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: UpdateProfileRequest) => studentService.updateProfile(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: studentQueryKeys.profile });
        },
    });
};

export const useChangePasswordMutation = () =>
    useMutation({
        mutationFn: (data: ChangePasswordRequest) => studentService.changePassword(data),
    });

export const useDeleteSelfAccountMutation = () =>
    useMutation({
        mutationFn: () => studentService.deleteSelfAccount(),
    });

// ----------------- Admin Queries & Mutations -----------------

export const useAdminUserStatsQuery = (options?: LiveQueryOptions) =>
    useQuery({
        queryKey: studentQueryKeys.adminStats,
        queryFn: studentService.getAdminStats,
        enabled: options?.enabled ?? true,
        refetchInterval: options?.refetchInterval ?? false,
        refetchOnWindowFocus: options?.refetchOnWindowFocus ?? true,
        refetchIntervalInBackground: options?.refetchIntervalInBackground ?? false,
    });

export const useAdminUsersQuery = (params: UserPagedRequest, options?: LiveQueryOptions) =>
    useQuery({
        queryKey: studentQueryKeys.adminList(params),
        queryFn: () => studentService.getAdminUsers(params),
        enabled: options?.enabled ?? true,
        refetchInterval: options?.refetchInterval ?? false,
        refetchOnWindowFocus: options?.refetchOnWindowFocus ?? true,
        refetchIntervalInBackground: options?.refetchIntervalInBackground ?? false,
    });

export const useAdminUserDetailQuery = (
    id: string,
    enabledOrOptions?: boolean | LiveQueryOptions,
    extraOptions?: LiveQueryOptions
) => {
    const isBool = typeof enabledOrOptions === 'boolean';
    const enabled = isBool ? enabledOrOptions : (enabledOrOptions?.enabled ?? true);
    const options = isBool ? extraOptions : enabledOrOptions;

    return useQuery({
        queryKey: studentQueryKeys.adminDetail(id),
        queryFn: () => studentService.getAdminUserDetail(id),
        enabled: Boolean(id) && enabled,
        refetchInterval: options?.refetchInterval ?? false,
        refetchOnWindowFocus: options?.refetchOnWindowFocus ?? true,
        refetchIntervalInBackground: options?.refetchIntervalInBackground ?? false,
    });
};

export const useToggleUserStatusMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: { isLocked: boolean; reason?: string } }) =>
            studentService.toggleUserStatus(id, payload),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
            queryClient.invalidateQueries({ queryKey: studentQueryKeys.adminDetail(variables.id) });
        },
    });
};

export const useUpdateUserRoleMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: { role: string } }) =>
            studentService.updateUserRole(id, payload),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
            queryClient.invalidateQueries({ queryKey: studentQueryKeys.adminDetail(variables.id) });
        },
    });
};

export const useDeleteUserMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => studentService.deleteUser(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
        },
    });
};

export const useAdminStatsQuery = useAdminUserStatsQuery;
export const useDeleteAdminUserMutation = useDeleteUserMutation;

export const useHeartbeatMutation = () =>
    useMutation({
        mutationFn: studentService.heartbeat,
    });

export const useMarkOfflineMutation = () =>
    useMutation({
        mutationFn: studentService.markOffline,
    });
