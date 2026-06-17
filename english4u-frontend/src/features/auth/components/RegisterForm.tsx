import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, User, CheckCircle } from 'lucide-react'
import { message } from 'antd'
import { useRegisterMutation } from '../api/auth.api'
import { SocialLogin } from './SocialLogin'
import { AuthDivider } from './AuthDivider'

export function RegisterForm() {
    const [showPassword, setShowPassword] = useState(false)
    const [formData, setFormData] = useState({
        displayName: '',
        email: '',
        password: '',
    })
    const [isRegistered, setIsRegistered] = useState(false)

    const registerMutation = useRegisterMutation()

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()

        if (!formData.email || !formData.password || !formData.displayName) {
            message.warning('Vui lòng điền đầy đủ thông tin.')
            return
        }

        registerMutation.mutate(formData, {
            onSuccess: (data: any) => {
                message.success(data.message || 'Đăng ký thành công!')
                setIsRegistered(true)
            },
            onError: (error: any) => {
                const errorMsg = error.response?.data?.message || 'Đăng ký thất bại. Vui lòng thử lại.'
                message.error(errorMsg)
            }
        })
    }

    if (isRegistered) {
        return (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <CheckCircle size={80} color="#10b981" style={{ margin: '0 auto 24px' }} />
                <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
                    Đăng ký thành công!
                </h2>
                <p style={{ fontSize: '1rem', color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: '32px' }}>
                    Chúng tôi đã gửi một liên kết kích hoạt đến email <strong>{formData.email}</strong>.<br />
                    Vui lòng kiểm tra hộp thư và bấm vào liên kết để xác nhận tài khoản trước khi đăng nhập.
                </p>
                <Link to="/login" style={{
                    display: 'inline-block',
                    padding: '14px 28px',
                    background: 'var(--color-primary)',
                    color: '#fff',
                    borderRadius: '12px',
                    fontWeight: 600,
                    textDecoration: 'none'
                }}>
                    Quay lại Đăng nhập
                </Link>
            </div>
        )
    }

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

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
                        Họ và tên
                    </label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <User style={{ position: 'absolute', left: '16px', color: 'var(--color-text-muted)' }} size={18} />
                        <input
                            type="text"
                            placeholder="Nguyễn Văn John"
                            value={formData.displayName}
                            onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
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
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
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
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
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
                    disabled={registerMutation.isPending}
                    style={{
                        width: '100%',
                        padding: '14px',
                        background: 'var(--color-primary)',
                        color: '#fff',
                        fontWeight: 600,
                        fontSize: '1rem',
                        borderRadius: '10px',
                        border: 'none',
                        cursor: registerMutation.isPending ? 'not-allowed' : 'pointer',
                        opacity: registerMutation.isPending ? 0.7 : 1,
                        transition: 'all 0.2s',
                        boxShadow: '0 4px 12px rgba(19, 125, 197, 0.2)'
                    }}
                    onMouseEnter={e => !registerMutation.isPending && (e.currentTarget.style.transform = 'translateY(-1px)')}
                    onMouseLeave={e => !registerMutation.isPending && (e.currentTarget.style.transform = 'translateY(0)')}
                >
                    {registerMutation.isPending ? 'Đang xử lý...' : 'Đăng ký tài khoản'}
                </button>
            </form>

            <p style={{ textAlign: 'center', fontSize: '0.9375rem', marginTop: '32px', color: 'var(--color-text-secondary)' }}>
                Đã có tài khoản? <Link to="/login" style={{ color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none' }}>Đăng nhập</Link>
            </p>
        </>
    )
}
