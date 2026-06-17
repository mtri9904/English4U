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
        let resizeTimeout: NodeJS.Timeout;

        const renderGoogleButton = () => {
            const google = (window as any).google;
            if (google && buttonRef.current) {
                buttonRef.current.innerHTML = '';
                const width = buttonRef.current.offsetWidth || 390;
                const buttonWidth = Math.max(200, Math.min(400, width));

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
                    width: buttonWidth,
                });
            }
        };

        const handleResize = () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(renderGoogleButton, 150);
        };

        if ((window as any).google) {
            renderGoogleButton();
        } else {
            const existingScript = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
            if (existingScript) {
                existingScript.addEventListener('load', renderGoogleButton);
            } else {
                const script = document.createElement('script');
                script.src = 'https://accounts.google.com/gsi/client';
                script.async = true;
                script.defer = true;
                script.onload = renderGoogleButton;
                document.head.appendChild(script);
            }
        }

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            clearTimeout(resizeTimeout);
            const existingScript = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
            if (existingScript) {
                existingScript.removeEventListener('load', renderGoogleButton);
            }
        };
    }, [handleCredentialResponse]);

    return (
        <div 
            ref={buttonRef} 
            style={{ 
                width: '100%', 
                height: '32px', 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center',
                overflow: 'hidden'
            }} 
        />
    );
}
