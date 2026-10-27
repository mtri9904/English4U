import { useMutation } from '@tanstack/react-query';
import { authService } from '../services/auth.service';

export const useLoginMutation = () => {
    return useMutation({
        mutationFn: authService.login,
    });
};

export const useRegisterMutation = () => {
    return useMutation({
        mutationFn: authService.register,
    });
};

export const useConfirmEmailMutation = () => {
    return useMutation({
        mutationFn: authService.confirmEmail,
    });
};

export const useVerifyOtpMutation = () => {
    return useMutation({
        mutationFn: authService.verifyOtp,
    });
};

export const useForgotPasswordMutation = () => {
    return useMutation({
        mutationFn: authService.forgotPassword,
    });
};

export const useResetPasswordMutation = () => {
    return useMutation({
        mutationFn: authService.resetPassword,
    });
};

export const useGoogleLoginMutation = () => {
    return useMutation({
        mutationFn: authService.googleLogin,
    });
};

export const useRefreshTokenMutation = () => {
    return useMutation({
        mutationFn: authService.refreshToken,
    });
};

