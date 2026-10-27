import { callApi } from '@/apis/handleApi';
import { ApiRouters } from '@/constants/api-routes';
import type { LoginRequest, RegisterRequest, AuthResponse, RefreshRequest } from '../types';

export const authService = {
    login: async (data: LoginRequest): Promise<AuthResponse> => {
        return callApi<AuthResponse>(ApiRouters.AUTH.LOGIN, data, 'post');
    },

    register: async (data: RegisterRequest): Promise<AuthResponse> => {
        return callApi<AuthResponse>(ApiRouters.AUTH.REGISTER, data, 'post');
    },

    googleLogin: async (idToken: string): Promise<AuthResponse> => {
        return callApi<AuthResponse>(ApiRouters.AUTH.GOOGLE, { idToken }, 'post');
    },

    confirmEmail: async (token: string): Promise<any> => {
        return callApi<any>(ApiRouters.AUTH.CONFIRM_EMAIL, undefined, 'post', undefined, {
            params: { token },
        });
    },

    verifyOtp: async (data: { email: string; otp: string }): Promise<any> => {
        return callApi<any>(ApiRouters.AUTH.VERIFY_OTP, data, 'post');
    },

    forgotPassword: async (email: string): Promise<any> => {
        return callApi<any>(ApiRouters.AUTH.FORGOT_PASSWORD, { email }, 'post');
    },

    resetPassword: async (data: any): Promise<any> => {
        return callApi<any>(ApiRouters.AUTH.RESET_PASSWORD, data, 'post');
    },

    refreshToken: async (data: RefreshRequest): Promise<AuthResponse> => {
        return callApi<AuthResponse>(ApiRouters.AUTH.REFRESH_TOKEN, data, 'post');
    },

    revokeToken: async (): Promise<any> => {
        return callApi<any>(ApiRouters.AUTH.REVOKE_TOKEN, undefined, 'post');
    },
};

