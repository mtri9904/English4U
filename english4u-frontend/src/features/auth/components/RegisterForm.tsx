import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, User, CheckCircle } from 'lucide-react'
import { message } from 'antd'
import { useRegisterMutation, useVerifyOtpMutation } from '../api/auth.api'
import { SocialLogin } from './SocialLogin'
import { AuthDivider } from './AuthDivider'

export function RegisterForm() {
    const navigate = useNavigate()
    const [showPassword, setShowPassword] = useState(false)
    const [formData, setFormData] = useState({
        displayName: '',
        email: '',
        password: '',
    })
    const [isRegistered, setIsRegistered] = useState(false)
    const [isVerifying, setIsVerifying] = useState(false)
    const [otp, setOtp] = useState('')

    const registerMutation = useRegisterMutation()
    const verifyOtpMutation = useVerifyOtpMutation()

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()

        if (!formData.email || !formData.password || !formData.displayName) {
            message.warning('Vui lòng điền đầy đủ thông tin.')
            return
        }

        registerMutation.mutate(formData, {
            onSuccess: (data: any) => {
                message.success(data.message || 'Mã xác thực đã được gửi!')
                setIsVerifying(true)
            },
            onError: (error: any) => {
                const errorMsg = error.response?.data?.message || 'Đăng ký thất bại. Vui lòng thử lại.'
                message.error(errorMsg)
            }
        })
    }

    const handleVerifyOtp = (e: React.FormEvent) => {
        e.preventDefault()
        if (otp.length !== 4) {
            message.warning('Vui lòng nhập mã OTP 4 số.')
            return
        }

        verifyOtpMutation.mutate({ email: formData.email, otp }, {
            onSuccess: (data: any) => {
                message.success(data?.message || 'Kích hoạt tài khoản thành công!')
                setIsRegistered(true)
                setIsVerifying(false)

                setTimeout(() => {
                    navigate('/login')
                }, 2500)
            },
            onError: (error: any) => {
                const errorMsg = error.response?.data?.message || 'Mã OTP không đúng.'
                message.error(errorMsg)
            }
        })
    }

    if (isRegistered) {
        return (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <CheckCircle size={80} color="#10b981" style={{ margin: '0 auto 24px' }} />
                <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
                    Kích hoạt thành công!
                </h2>
                <p style={{ fontSize: '1rem', color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: '32px' }}>
                    Tài khoản của bạn đã được xác thực.<br />
                    Đang chuyển hướng về trang đăng nhập...
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
                    Đăng nhập ngay
                </Link>
            </div>
        )
    }

    if (isVerifying) {
        return (
            <div style={{ textAlign: 'center' }}>
                <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
                    Xác thực tài khoản
                </h2>
                <p style={{ fontSize: '0.9375rem', color: 'var(--color-text-secondary)', marginBottom: '36px' }}>
                    Nhập mã code 4 số vừa được gửi đến <strong>{formData.email}</strong>
                </p>

                <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
                        <input
                            type="text"
                            maxLength={4}
                            value={otp}
                            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                            placeholder="0000"
                            style={{
                                width: '160px',
                                textAlign: 'center',
                                padding: '16px',
                                border: '2px solid var(--color-primary)',
                                borderRadius: '12px',
                                fontSize: '2rem',
                                fontWeight: 700,
                                letterSpacing: '8px',
                                outline: 'none',
                                background: '#f8fafc'
                            }}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={verifyOtpMutation.isPending}
                        style={{
                            width: '100%',
                            padding: '14px',
                            background: 'var(--color-primary)',
                            color: '#fff',
                            fontWeight: 600,
                            fontSize: '1rem',
                            borderRadius: '10px',
                            border: 'none',
                            cursor: verifyOtpMutation.isPending ? 'not-allowed' : 'pointer',
                            opacity: verifyOtpMutation.isPending ? 0.7 : 1,
                            transition: 'all 0.2s',
                            boxShadow: '0 4px 12px rgba(19, 125, 197, 0.2)'
                        }}
                    >
                        {verifyOtpMutation.isPending ? 'Đang xác thực...' : 'Xác thực ngay'}
                    </button>

                    <button
                        type="button"
                        onClick={() => setIsVerifying(false)}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--color-text-secondary)',
                            fontSize: '0.875rem',
                            cursor: 'pointer',
                            textDecoration: 'underline'
                        }}
                    >
                        Quay lại đăng ký
                    </button>
                </form>
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
