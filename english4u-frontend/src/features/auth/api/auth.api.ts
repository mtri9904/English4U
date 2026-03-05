import { axiosInstance } from '@/apis/axios.instance';
import { useMutation } from '@tanstack/react-query';
import { LoginRequest, RegisterRequest, AuthResponse } from '../types';

export const authApi = {
    login: async (data: LoginRequest): Promise<AuthResponse> => {
        const response = await axiosInstance.post<AuthResponse>('/auth/login', data);
        return response.data;
    },
    register: async (data: RegisterRequest): Promise<AuthResponse> => {
        const response = await axiosInstance.post<AuthResponse>('/auth/register', data);
        return response.data;
    },
    googleLogin: async (idToken: string): Promise<AuthResponse> => {
        const response = await axiosInstance.post<AuthResponse>('/auth/google', { idToken });
        return response.data;
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

export const useGoogleLoginMutation = () => {
    return useMutation({
        mutationFn: authApi.googleLogin,
    });
};
