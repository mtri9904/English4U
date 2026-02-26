import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, User } from 'lucide-react'
import { SocialLogin } from './SocialLogin'
import { AuthDivider } from './AuthDivider'

export function RegisterForm() {
    const [showPassword, setShowPassword] = useState(false)
    return (
        <>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
                Tạo tài khoản
            </h2>
            <p style={{ fontSize: '0.9375rem', color: 'var(--color-text-secondary)', marginBottom: '36px' }}>
                Bắt đầu hành trình học tiếng Anh của bạn ngay hôm nay.
            </p>

            <SocialLogin />
            <AuthDivider text="Hoặc đăng ký bằng email" />

            <form onSubmit={(e) => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
                        Họ và tên
                    </label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <User style={{ position: 'absolute', left: '16px', color: 'var(--color-text-muted)' }} size={18} />
                        <input
                            type="text"
                            placeholder="John Doe"
                            style={{ width: '100%', padding: '14px 16px 14px 44px', border: '1px solid var(--color-border)', borderRadius: '10px', fontSize: '0.9375rem', outline: 'none', transition: 'border 0.2s' }}
                            onFocus={e => e.target.style.borderColor = 'var(--color-primary)'}
                            onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
                        />
                    </div>
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
                        Địa chỉ Email
                    </label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <Mail style={{ position: 'absolute', left: '16px', color: 'var(--color-text-muted)' }} size={18} />
                        <input
                            type="email"
                            placeholder="name@example.com"
                            style={{ width: '100%', padding: '14px 16px 14px 44px', border: '1px solid var(--color-border)', borderRadius: '10px', fontSize: '0.9375rem', outline: 'none', transition: 'border 0.2s' }}
                            onFocus={e => e.target.style.borderColor = 'var(--color-primary)'}
                            onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
                        />
                    </div>
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
                        Mật khẩu
                    </label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <Lock style={{ position: 'absolute', left: '16px', color: 'var(--color-text-muted)' }} size={18} />
                        <input
                            type={showPassword ? 'text' : 'password'}
                            placeholder="••••••••"
                            style={{ width: '100%', padding: '14px 44px 14px 44px', border: '1px solid var(--color-border)', borderRadius: '10px', fontSize: '0.9375rem', outline: 'none', transition: 'border 0.2s' }}
                            onFocus={e => e.target.style.borderColor = 'var(--color-primary)'}
                            onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
                        />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: '16px', color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>
                </div>

                <button
                    type="submit"
                    style={{
                        width: '100%',
                        padding: '14px',
                        background: 'var(--color-primary)',
                        color: '#fff',
                        fontWeight: 600,
                        fontSize: '1rem',
                        borderRadius: '10px',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        boxShadow: '0 4px 12px rgba(19, 125, 197, 0.2)'
                    }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                >
                    Đăng ký tài khoản
                </button>
            </form>

            <p style={{ textAlign: 'center', fontSize: '0.9375rem', marginTop: '32px', color: 'var(--color-text-secondary)' }}>
                Đã có tài khoản? <Link to="/login" style={{ color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none' }}>Đăng nhập</Link>
            </p>
        </>
    )
}
