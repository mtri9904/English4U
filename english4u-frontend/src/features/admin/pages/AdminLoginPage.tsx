import { useEffect, useState } from 'react';
import { Mail, Lock, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { message } from 'antd';
import { GalaxyBackground } from '../components/GalaxyBackground';
import { useLoginMutation } from '@/features/auth/api/auth.api';
import { GoogleLoginButton } from '@/features/auth/components/GoogleLoginButton';
import { consumeForcedLogoutReason } from '@/features/auth/lib/sessionSignals';


export function AdminLoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const navigate = useNavigate();
    const loginMutation = useLoginMutation();

    useEffect(() => {
        const forcedLogoutReason = consumeForcedLogoutReason();
        if (forcedLogoutReason) {
            message.warning(forcedLogoutReason);
        }
    }, []);

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        loginMutation.mutate(
            { email, password },
            {
                onSuccess: (data) => {
                    if (data.role !== 'Admin') {
                        message.error('Chỉ Quản trị viên mới có quyền đăng nhập vào CMS!');
                        return;
                    }

                    message.success('Đăng nhập thành công!');
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('userId', data.userId);
                    navigate('/admin/dashboard');
                },
                onError: (error: any) => {
                    message.error(error?.response?.data?.message || 'Tài khoản hoặc mật khẩu không chính xác!');
                }
            }
        );
    };

    return (
        <div style={{ display: 'flex', minHeight: '100vh', position: 'relative', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <GalaxyBackground />
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                style={{
                    background: '#fff',
                    padding: '48px 40px',
                    borderRadius: '24px',
                    width: '100%',
                    maxWidth: '420px',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    position: 'relative',
                    zIndex: 10
                }}
            >

                <div style={{ marginBottom: '24px' }}>
                    <img
                        src="/logo/Logo.png"
                        alt="English4U Logo"
                        style={{ width: '88px', height: '88px', objectFit: 'contain' }}
                    />
                </div>

                <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', marginBottom: '8px', textAlign: 'center' }}>
                    English4U
                </h1>
                <p style={{ fontSize: '0.9375rem', color: '#64748b', marginBottom: '32px', textAlign: 'center' }}>
                    Đăng nhập để vào hệ thống quản lý
                </p>

                <form onSubmit={handleLogin} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <Mail style={{ position: 'absolute', left: '16px', color: '#94a3b8' }} size={20} />
                            <input
                                type="email"
                                placeholder="Email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                style={{ width: '100%', padding: '14px 16px 14px 46px', border: '1px solid #e2e8f0', borderRadius: '12px', fontSize: '0.9375rem', outline: 'none', transition: 'all 0.2s', backgroundColor: '#f8fafc' }}
                                onFocus={e => { e.target.style.borderColor = '#0ea5e9'; e.target.style.backgroundColor = '#fff'; }}
                                onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.backgroundColor = '#f8fafc'; }}
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <Lock style={{ position: 'absolute', left: '16px', color: '#94a3b8' }} size={20} />
                            <input
                                type="password"
                                placeholder="Mật khẩu"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                style={{ width: '100%', padding: '14px 16px 14px 46px', border: '1px solid #e2e8f0', borderRadius: '12px', fontSize: '0.9375rem', outline: 'none', transition: 'all 0.2s', backgroundColor: '#f8fafc' }}
                                onFocus={e => { e.target.style.borderColor = '#0ea5e9'; e.target.style.backgroundColor = '#fff'; }}
                                onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.backgroundColor = '#f8fafc'; }}
                                required
                            />
                        </div>
                    </div>

                    <motion.button
                        type={loginMutation.isPending ? 'button' : 'submit'}
                        disabled={loginMutation.isPending}
                        whileHover={!loginMutation.isPending ? { scale: 1.02 } : {}}
                        whileTap={!loginMutation.isPending ? { scale: 0.96 } : {}}
                        style={{
                            width: '100%',
                            padding: '14px',
                            background: loginMutation.isPending ? '#94a3b8' : '#0ea5e9',
                            color: '#fff',
                            fontWeight: 600,
                            fontSize: '1rem',
                            borderRadius: '12px',
                            border: 'none',
                            cursor: loginMutation.isPending ? 'not-allowed' : 'pointer',
                            marginTop: '12px',
                            boxShadow: loginMutation.isPending ? 'none' : '0 4px 12px rgba(14, 165, 233, 0.25)',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            gap: '8px'
                        }}
                    >
                        {loginMutation.isPending ? <Loader2 className="animate-spin" size={20} /> : null}
                        {loginMutation.isPending ? 'Đang xử lý...' : 'Đăng nhập'}
                    </motion.button>
                </form>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', margin: '20px 0' }}>
                    <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
                    <span style={{ fontSize: '0.8125rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>Hoặc đăng nhập với</span>
                    <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
                </div>

                <GoogleLoginButton requiredRole="Admin" redirectTo="/admin/dashboard" />
            </motion.div>
        </div>
    );
}
