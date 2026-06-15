import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { Lock, Eye, EyeOff, CheckCircle } from 'lucide-react'
import { message } from 'antd'
import { useResetPasswordMutation } from '../api/auth.api'

export default function ResetPasswordPage() {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const token = searchParams.get('token')
    const [showPassword, setShowPassword] = useState(false)
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [isSuccess, setIsSuccess] = useState(false)

    const resetMutation = useResetPasswordMutation()

    useEffect(() => {
        if (!token) {
            message.error('Token reset mật khẩu không tìm thấy.')
            navigate('/login')
        }
    }, [token, navigate])

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()

        if (!newPassword || !confirmPassword) {
            message.warning('Vui lòng điền mật khẩu mới.')
            return
        }

        if (newPassword !== confirmPassword) {
            message.error('Mật khẩu xác nhận không khớp.')
            return
        }

        if (newPassword.length < 6) {
            message.error('Mật khẩu phải có ít nhất 6 ký tự.')
            return
        }

        resetMutation.mutate({ token, newPassword }, {
            onSuccess: () => {
                message.success('Đã đặt lại mật khẩu mới.')
                setIsSuccess(true)
            },
            onError: (error: any) => {
                message.error(error.response?.data?.message || 'Đổi mật khẩu thất bại.')
            }
        })
    }

    if (isSuccess) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)', padding: '20px' }}>
                <div style={{ maxWidth: '480px', width: '100%', background: '#fff', padding: '48px', borderRadius: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', textAlign: 'center' }}>
                    <CheckCircle size={64} color="#10b981" style={{ margin: '0 auto 24px' }} />
                    <h2 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '16px' }}>Thành công!</h2>
                    <p style={{ color: 'var(--color-text-secondary)', marginBottom: '32px' }}>Mật khẩu của bạn đã được cập nhật mới. Bây giờ bạn có thể đăng nhập bằng mật khẩu này.</p>
                    <Link to="/login" style={{ display: 'block', width: '100%', padding: '14px', background: 'var(--color-primary)', color: '#fff', borderRadius: '12px', fontWeight: 600, textDecoration: 'none' }}>Đăng nhập ngay</Link>
                </div>
            </div>
        )
    }

    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)', padding: '20px' }}>
            <div style={{ maxWidth: '480px', width: '100%', background: '#fff', padding: '48px', borderRadius: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
                <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '8px' }}>Tạo mật khẩu mới</h2>
                <p style={{ fontSize: '0.9375rem', color: 'var(--color-text-secondary)', marginBottom: '32px' }}>Hãy chọn một mật khẩu mạnh để bảo mật tài khoản của bạn.</p>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '8px' }}>Mật khẩu mới</label>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <Lock style={{ position: 'absolute', left: '16px', color: 'var(--color-text-muted)' }} size={18} />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                placeholder="••••••••"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                style={{ width: '100%', padding: '14px 44px 14px 44px', border: '1px solid var(--color-border)', borderRadius: '10px', fontSize: '0.9375rem', outline: 'none' }}
                            />
                            <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: '16px', color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '8px' }}>Xác nhận mật khẩu</label>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <Lock style={{ position: 'absolute', left: '16px', color: 'var(--color-text-muted)' }} size={18} />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                placeholder="••••••••"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                style={{ width: '100%', padding: '14px 16px 14px 44px', border: '1px solid var(--color-border)', borderRadius: '10px', fontSize: '0.9375rem', outline: 'none' }}
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={resetMutation.isPending}
                        style={{ width: '100%', padding: '14px', background: 'var(--color-primary)', color: '#fff', fontWeight: 600, fontSize: '1rem', borderRadius: '10px', border: 'none', cursor: resetMutation.isPending ? 'not-allowed' : 'pointer', opacity: resetMutation.isPending ? 0.7 : 1, transition: 'all 0.2s' }}
                    >
                        {resetMutation.isPending ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
                    </button>
                </form>
            </div>
        </div>
    )
}
