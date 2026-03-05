import { axiosInstance } from '@/apis/axios.instance';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface UserProfileDto {
    id: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
    phone: string | null;
    department: string | null;
    position: string | null;
    notes: string | null;
    isActive: boolean;
    lastLoginAt: string | null;
    role: string | null;
    createdAt: string;
}

export interface UpdateProfileRequest {
    displayName: string;
    avatarUrl?: string;
    phone?: string;
    department?: string;
    position?: string;
    notes?: string;
    bio?: string;
}

export interface ChangePasswordRequest {
    oldPassword: string;
    newPassword: string;
}

export const userKeys = {
    profile: ['user', 'profile'] as const,
};

export const userApi = {
    getProfile: async (): Promise<UserProfileDto> => {
        const res = await axiosInstance.get<UserProfileDto>('/user/profile');
        return res.data;
    },
    updateProfile: async (data: UpdateProfileRequest): Promise<void> => {
        await axiosInstance.put('/user/profile', data);
    },
    changePassword: async (data: ChangePasswordRequest): Promise<void> => {
        await axiosInstance.put('/user/change-password', data);
    },
};

export const useUserProfileQuery = () =>
    useQuery({
        queryKey: userKeys.profile,
        queryFn: userApi.getProfile,
    });

export const useUpdateProfileMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: userApi.updateProfile,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.profile }),
    });
};

export const useChangePasswordMutation = () => {
    return useMutation({
        mutationFn: userApi.changePassword,
    });
};
