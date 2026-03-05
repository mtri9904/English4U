import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, Check, Loader2 } from 'lucide-react'
import { SocialLogin } from './SocialLogin'
import { AuthDivider } from './AuthDivider'
import { useLoginMutation } from '../api/auth.api'
import { message } from 'antd'

export function LoginForm() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [keepLogged, setKeepLogged] = useState(false)
    const navigate = useNavigate()
    const loginMutation = useLoginMutation()

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault()
        if (!email || !password) {
            message.warning('Vui lòng nhập email và mật khẩu!')
            return
        }
        loginMutation.mutate(
            { email, password },
            {
                onSuccess: (data) => {
                    localStorage.setItem('token', data.token)
                    localStorage.setItem('userId', data.userId)
                    message.success('Đăng nhập thành công!')
                    navigate('/app')
                },
                onError: (error: unknown) => {
                    const err = error as { response?: { data?: { message?: string } } }
                    message.error(err?.response?.data?.message || 'Tài khoản hoặc mật khẩu không chính xác!')
                }
            }
        )
    }

    return (
        <>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
                Đăng nhập
            </h2>
            <p style={{ fontSize: '0.9375rem', color: 'var(--color-text-secondary)', marginBottom: '36px' }}>
                Vui lòng nhập thông tin để đăng nhập.
            </p>

            <SocialLogin />
            <AuthDivider text="Hoặc tiếp tục với email" />

            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
                        Địa chỉ Email
                    </label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <Mail style={{ position: 'absolute', left: '16px', color: 'var(--color-text-muted)' }} size={18} />
                        <input
                            type="email"
                            placeholder="name@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            style={{ width: '100%', padding: '14px 16px 14px 44px', border: '1px solid var(--color-border)', borderRadius: '10px', fontSize: '0.9375rem', outline: 'none', transition: 'border 0.2s' }}
                            onFocus={e => e.target.style.borderColor = 'var(--color-primary)'}
                            onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
                            required
                        />
                    </div>
                </div>

                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                            Mật khẩu
                        </label>
                        <Link to="/forgot-password" style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-primary)', textDecoration: 'none' }}>
                            Quên mật khẩu?
                        </Link>
                    </div>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <Lock style={{ position: 'absolute', left: '16px', color: 'var(--color-text-muted)' }} size={18} />
                        <input
                            type={showPassword ? 'text' : 'password'}
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            style={{ width: '100%', padding: '14px 44px 14px 44px', border: '1px solid var(--color-border)', borderRadius: '10px', fontSize: '0.9375rem', outline: 'none', transition: 'border 0.2s' }}
                            onFocus={e => e.target.style.borderColor = 'var(--color-primary)'}
                            onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
                            required
                        />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: '16px', color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', marginBottom: '8px' }}>
                    <button
                        type="button"
                        onClick={() => setKeepLogged(!keepLogged)}
                        style={{
                            width: '18px',
                            height: '18px',
                            borderRadius: '50%',
                            border: keepLogged ? '1px solid var(--color-primary)' : '1px solid var(--color-border-strong)',
                            background: keepLogged ? 'var(--color-primary)' : '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            padding: 0
                        }}
                    >
                        {keepLogged && <Check size={12} color="#fff" strokeWidth={3} />}
                    </button>
                    <span
                        onClick={() => setKeepLogged(!keepLogged)}
                        style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', cursor: 'pointer', userSelect: 'none' }}
                    >
                        Duy trì đăng nhập trong 30 ngày
                    </span>
                </div>

                <button
                    type="submit"
                    disabled={loginMutation.isPending}
                    style={{
                        width: '100%',
                        padding: '14px',
                        background: loginMutation.isPending ? '#94a3b8' : 'var(--color-primary)',
                        color: '#fff',
                        fontWeight: 600,
                        fontSize: '1rem',
                        borderRadius: '10px',
                        border: 'none',
                        cursor: loginMutation.isPending ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s',
                        boxShadow: loginMutation.isPending ? 'none' : '0 4px 12px rgba(19, 125, 197, 0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                    }}
                    onMouseEnter={e => { if (!loginMutation.isPending) e.currentTarget.style.transform = 'translateY(-1px)' }}
                    onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                >
                    {loginMutation.isPending && <Loader2 size={18} className="animate-spin" />}
                    {loginMutation.isPending ? 'Đang xử lý...' : 'Đăng nhập hệ thống'}
                </button>
            </form>

            <p style={{ textAlign: 'center', fontSize: '0.9375rem', marginTop: '32px', color: 'var(--color-text-secondary)' }}>
                Chưa có tài khoản? <Link to="/register" style={{ color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none' }}>Tạo tài khoản</Link>
            </p>
        </>
    )
}
