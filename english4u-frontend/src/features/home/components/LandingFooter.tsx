import { Link } from 'react-router-dom'
import { Button } from '@/shared/ui/Button'

interface FooterLinkItem {
    label: string
    href: string
}

const FOOTER_SECTIONS: Record<string, FooterLinkItem[]> = {
    'Sản phẩm': [
        { label: 'Thi thử IELTS', href: '/app/practice' },
        { label: 'Luyện Nói AI', href: '/app/practice' },
        { label: 'Luyện Viết AI', href: '/app/practice' },
        { label: 'Trang cá nhân', href: '/app/profile' }
    ],
    'Tài nguyên': [
        { label: 'Giới thiệu', href: '/about' },
        { label: 'Liên hệ', href: '/contact' },
        { label: 'Chính sách Bảo mật', href: '/privacy-policy' },
        { label: 'Điều khoản Dịch vụ', href: '/terms-of-service' },
    ],
    'Hệ thống': [
        { label: 'Đăng nhập', href: '/login' },
        { label: 'Đăng ký', href: '/register' },
        { label: 'Quản trị viên (CMS)', href: '/admin/login' },
    ],
}

export function LandingFooter() {
    return (
        <footer style={{ background: 'var(--color-bg-dark)', color: 'rgba(255,255,255,0.6)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(19,125,197,0.4), transparent)' }} />
            <div style={{ position: 'absolute', top: -100, right: -100, width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(ellipse at center, rgba(19,125,197,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
            <div className="container-app" style={{ padding: '64px 24px 40px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 48, marginBottom: 48 }}>
                    <div>
                        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, textDecoration: 'none' }}>
                            <img
                                src="/logo/Logo.png"
                                alt="English4U Logo"
                                style={{
                                    width: 45,
                                    height: 45,
                                    objectFit: 'contain'
                                }}
                            />
                            <span style={{ fontFamily: 'var(--font-serif)', fontSize: '1.35rem', fontWeight: 800, color: '#fff' }}>English<span style={{ color: '#38bdf8' }}>4U</span></span>
                        </Link>
                        <p style={{ fontSize: '0.9rem', lineHeight: 1.7, maxWidth: 300, marginBottom: 24, color: 'rgba(255,255,255,0.5)' }}>Học tiếng Anh với sức mạnh AI. Chuẩn bị cho IELTS với lộ trình luyện tập cá nhân hóa 4 kỹ năng.</p>
                        <div style={{ display: 'flex', gap: 10 }}>
                            {['𝕏', 'in', 'f', '▶'].map((icon, i) => (
                                <button key={i} style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(19,125,197,0.3)'; e.currentTarget.style.color = '#fff' }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)' }}>{icon}</button>
                            ))}
                        </div>
                    </div>
                    {Object.entries(FOOTER_SECTIONS).map(([group, links]) => (
                        <div key={group}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 16 }}>{group}</div>
                            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {links.map((link) => (
                                    <li key={link.label}>
                                        <Link to={link.href} style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.5)', textDecoration: 'none', transition: 'color 0.2s' }} onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')} onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}>{link.label}</Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
                <div style={{ padding: '32px 0 0', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '12px 20px', flex: 1, maxWidth: 380 }}>
                        <span style={{ fontSize: '0.875rem', color: 'rgba(245, 238, 238, 1)', whiteSpace: 'nowrap' }}>Nhận tin hàng tuần</span>
                        <input type="email" placeholder="email@gmail.com" style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: '0.875rem', color: '#fff' }} />
                        <Button variant="primary" size="sm" style={{ whiteSpace: 'nowrap' }}>Đăng ký</Button>
                    </div>
                    <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.3)' }}>© 2026 English4U. Tất cả quyền được bảo lưu.</p>
                </div>
            </div>
        </footer>
    )
}
