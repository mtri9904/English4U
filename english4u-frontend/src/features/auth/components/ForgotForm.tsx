import { Link } from 'react-router-dom'
import { Mail, ArrowLeft } from 'lucide-react'

export function ForgotForm() {
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

            <form onSubmit={(e) => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
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
                    Gửi Liên Kết Khôi Phục
                </button>
            </form>
        </>
    )
}
