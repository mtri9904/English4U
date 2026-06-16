import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react'
import { message } from 'antd'
import { useForgotPasswordMutation } from '../api/auth.api'

export function ForgotForm() {
    const [email, setEmail] = useState('')
    const [isSent, setIsSent] = useState(false)
    const forgotMutation = useForgotPasswordMutation()

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!email) {
            message.warning('Vui lòng nhập địa chỉ email.')
            return
        }

        forgotMutation.mutate(email, {
            onSuccess: (data: any) => {
                message.success(data?.message || 'Link reset mật khẩu đã được gửi.')
                setIsSent(true)
            },
            onError: (error: any) => {
                const errorMsg = error.response?.data?.message || 'Gửi liên kết thất bại. Vui lòng thử lại.'
                message.error(errorMsg)
            }
        })
    }

    if (isSent) {
        return (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ width: '80px', height: '80px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                    <CheckCircle size={40} color="#10b981" />
                </div>
                <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
                    Kiểm tra Email
                </h2>
                <p style={{ fontSize: '1rem', color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: '32px' }}>
                    Nếu địa chỉ <strong>{email}</strong> tồn tại trong hệ thống, bạn sẽ sớm nhận được một liên kết để đặt lại mật khẩu.
                </p>
                <Link to="/login" style={{
                    display: 'inline-block',
                    padding: '12px 24px',
                    background: 'var(--color-primary)',
                    color: '#fff',
                    borderRadius: '10px',
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
            <div style={{ marginBottom: '24px' }}>
                <Link to="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-secondary)', fontSize: '0.9375rem', fontWeight: 500, textDecoration: 'none' }}>
                    <ArrowLeft size={16} /> Quay lại trang đăng nhập
                </Link>
            </div>

            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
                Quên mật khẩu
            </h2>
            <p style={{ fontSize: '0.9375rem', color: 'var(--color-text-secondary)', marginBottom: '36px', lineHeight: 1.6 }}>
                Đừng lo lắng! Vui lòng nhập địa chỉ email của bạn, chúng tôi sẽ gửi liên kết để đặt lại mật khẩu.
            </p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
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

                <button
                    type="submit"
                    disabled={forgotMutation.isPending}
                    style={{
                        width: '100%',
                        padding: '14px',
                        background: 'var(--color-primary)',
                        color: '#fff',
                        fontWeight: 600,
                        fontSize: '1rem',
                        borderRadius: '10px',
                        border: 'none',
                        cursor: forgotMutation.isPending ? 'not-allowed' : 'pointer',
                        opacity: forgotMutation.isPending ? 0.7 : 1,
                        transition: 'all 0.2s',
                        boxShadow: '0 4px 12px rgba(19, 125, 197, 0.2)'
                    }}
                >
                    {forgotMutation.isPending ? 'Đang gửi...' : 'Gửi Liên Kết Khôi Phục'}
                </button>
            </form>
        </>
    )
}
