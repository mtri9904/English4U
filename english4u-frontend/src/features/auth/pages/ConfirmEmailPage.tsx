import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useConfirmEmailMutation } from '../api/auth.api';

export function ConfirmEmailPage() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const confirmMutation = useConfirmEmailMutation();
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        if (!token) {
            setStatus('error');
            setErrorMessage('Token kích hoạt không tìm thấy.');
            return;
        }

        confirmMutation.mutate(token, {
            onSuccess: () => {
                setStatus('success');
            },
            onError: (error: any) => {
                setStatus('error');
                setErrorMessage(error.response?.data?.message || 'Liên kết kích hoạt đã hết hạn hoặc không hợp lệ.');
            }
        });
    }, [token]);

    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)', padding: '20px' }}>
            <div style={{ maxWidth: '480px', width: '100%', background: '#fff', padding: '48px', borderRadius: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', textAlign: 'center' }}>
                {status === 'loading' && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px' }}>
                        <Loader2 size={64} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Đang kích hoạt tài khoản</h2>
                        <p style={{ color: 'var(--color-text-secondary)' }}>Vui lòng đợi trong giây lát khi chúng tôi xác nhận liên kết của bạn...</p>
                    </div>
                )}

                {status === 'success' && (
                    <div>
                        <CheckCircle size={64} color="#10b981" style={{ margin: '0 auto 24px' }} />
                        <h2 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '16px' }}>Thành công!</h2>
                        <p style={{ color: 'var(--color-text-secondary)', marginBottom: '32px' }}>Tài khoản của bạn đã được kích hoạt thành công. Bây giờ bạn có thể đăng nhập để trải nghiệm hệ thống.</p>
                        <Link to="/login" style={{ display: 'block', width: '100%', padding: '14px', background: 'var(--color-primary)', color: '#fff', borderRadius: '12px', fontWeight: 600, textDecoration: 'none' }}>Đăng nhập ngay</Link>
                    </div>
                )}

                {status === 'error' && (
                    <div>
                        <XCircle size={64} color="#ef4444" style={{ margin: '0 auto 24px' }} />
                        <h2 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '16px' }}>Kích hoạt thất bại</h2>
                        <p style={{ color: 'var(--color-text-secondary)', marginBottom: '32px' }}>{errorMessage}</p>
                        <Link to="/register" style={{ display: 'block', width: '100%', padding: '14px', background: 'var(--color-primary)', color: '#fff', borderRadius: '12px', fontWeight: 600, textDecoration: 'none' }}>Đăng ký lại</Link>
                    </div>
                )}
            </div>
        </div>
    );
}
