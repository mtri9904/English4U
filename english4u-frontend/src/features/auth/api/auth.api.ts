import { axiosInstance } from '@/apis/axios.instance';
import { useMutation } from '@tanstack/react-query';
import { LoginRequest, RegisterRequest, AuthResponse, RefreshRequest } from '../types';

export const authApi = {
    login: async (data: LoginRequest): Promise<AuthResponse> => {
        const response = await axiosInstance.post<AuthResponse>('auth/login', data);
        return response.data;
    },
    register: async (data: RegisterRequest): Promise<AuthResponse> => {
        const response = await axiosInstance.post<AuthResponse>('auth/register', data);
        return response.data;
    },
    googleLogin: async (idToken: string): Promise<AuthResponse> => {
        const response = await axiosInstance.post<AuthResponse>('auth/google', { idToken });
        return response.data;
    },
    verifyEmail: async (token: string): Promise<void> => {
        await axiosInstance.get(`auth/verify-email`, { params: { token } });
    },
    verifyOtp: async (data: { email: string; otp: string }): Promise<void> => {
        await axiosInstance.post('auth/verify-otp', data);
    },
    forgotPassword: async (email: string): Promise<void> => {
        await axiosInstance.post('auth/forgot-password', { email });
    },
    resetPassword: async (data: any): Promise<void> => {
        await axiosInstance.post('auth/reset-password', data);
    },
    refreshToken: async (data: RefreshRequest): Promise<AuthResponse> => {
        const response = await axiosInstance.post<AuthResponse>('auth/refresh', data);
        return response.data;
    },
    revokeToken: async (): Promise<void> => {
        await axiosInstance.post('auth/revoke');
    },
};

export const useLoginMutation = () => {
    return useMutation({
        mutationFn: authApi.login,
    });
};

export const useRegisterMutation = () => {
    return useMutation({
        mutationFn: authApi.register,
    });
};

export const useVerifyEmailMutation = () => {
    return useMutation({
        mutationFn: authApi.verifyEmail,
    });
};

export const useVerifyOtpMutation = () => {
    return useMutation({
        mutationFn: authApi.verifyOtp,
    });
};

export const useForgotPasswordMutation = () => {
    return useMutation({
        mutationFn: authApi.forgotPassword,
    });
};

export const useResetPasswordMutation = () => {
    return useMutation({
        mutationFn: authApi.resetPassword,
    });
};

export const useGoogleLoginMutation = () => {
    return useMutation({
        mutationFn: authApi.googleLogin,
    });
};

export const useRefreshTokenMutation = () => {
    return useMutation({
        mutationFn: authApi.refreshToken,
    });
};
