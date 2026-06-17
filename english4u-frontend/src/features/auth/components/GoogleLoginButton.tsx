import { useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { message } from 'antd';
import { useGoogleLoginMutation } from '../api/auth.api';

const GOOGLE_CLIENT_ID = '207103112017-sao9nmtfknht1cja68hqd1pv3bb8i4tt.apps.googleusercontent.com';

interface GoogleLoginButtonProps {
    requiredRole?: string;
    redirectTo?: string;
}

export function GoogleLoginButton({ requiredRole, redirectTo = '/' }: GoogleLoginButtonProps) {
    const navigate = useNavigate();
    const googleMutation = useGoogleLoginMutation();
    const buttonRef = useRef<HTMLDivElement>(null);

    const handleCredentialResponse = useCallback(
        (response: { credential: string }) => {
            googleMutation.mutate(response.credential, {
                onSuccess: (data) => {
                    if (requiredRole && data.role !== requiredRole) {
                        message.error('Tài khoản không có quyền truy cập!');
                        return;
                    }
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('refreshToken', data.refreshToken);
                    localStorage.setItem('userId', data.userId);
                    message.success('Đăng nhập Google thành công!');
                    navigate(redirectTo);
                },
                onError: (error: any) => {
                    const errorMsg = error.response?.data?.message || 'Đăng nhập Google thất bại!';
                    message.error(errorMsg);
                },
            });
        },
        [googleMutation, requiredRole, redirectTo, navigate],
    );

    useEffect(() => {
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = () => {
            const google = (window as any).google;
            if (google && buttonRef.current) {
                google.accounts.id.initialize({
                    client_id: GOOGLE_CLIENT_ID,
                    callback: handleCredentialResponse,
                });
                google.accounts.id.renderButton(buttonRef.current, {
                    theme: 'outline',
                    size: 'medium',
                    text: 'signin_with',
                    shape: 'rectangular',
                    logo_alignment: 'left',
                });
            }
        };
        document.head.appendChild(script);

        return () => {
            const existingScript = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
            if (existingScript) existingScript.remove();
        };
    }, [handleCredentialResponse]);

    return <div ref={buttonRef} style={{ width: '100%' }} />;
}
