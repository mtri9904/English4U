import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { isTokenExpired } from '@/apis/axios.instance'

const NAV_LINKS = [
    { label: 'Trang chủ', href: '/' },
    { label: 'Giới thiệu', href: '/about' },
    { label: 'Liên hệ', href: '/contact' },
]

export function LandingHeader() {
    const [scrolled, setScrolled] = useState(false)
    const isLoggedIn = !isTokenExpired()

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 20)
        window.addEventListener('scroll', onScroll, { passive: true })
        return () => window.removeEventListener('scroll', onScroll)
    }, [])

    return (
        <header style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000, transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)', background: scrolled ? 'rgba(255,255,255,0.88)' : 'transparent', backdropFilter: scrolled ? 'blur(20px)' : 'none', borderBottom: scrolled ? '1px solid rgba(19,125,197,0.1)' : '1px solid transparent', boxShadow: scrolled ? '0 4px 24px rgba(13,27,42,0.08)' : 'none' }}>
            <div className="container-app" style={{ display: 'flex', alignItems: 'center', height: 68, gap: 32 }}>
                <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flexShrink: 0 }}>
                    <img
                        src="logo/Logo.png"
                        style={{
                            width: 45,
                            height: 45,
                            objectFit: 'cover'
                        }}
                    />
                </a>
                <nav style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 4 }}>
                    {NAV_LINKS.map((link) => (
                        <Link
                            key={link.label}
                            to={link.href}
                            style={{ textDecoration: 'none', padding: '6px 16px', fontSize: '0.9375rem', fontWeight: 500, color: 'var(--color-text-secondary)', borderRadius: 8, transition: 'all 0.2s', fontFamily: 'var(--font-sans)' }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-primary)'; e.currentTarget.style.background = 'var(--color-primary-light)' }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.background = 'none' }}
                        >{link.label}</Link>
                    ))}
                </nav>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                    {isLoggedIn ? (
                        <Link
                            to="/app"
                            style={{ background: '#2267e7ff', border: 'none', padding: '6px 18px', fontSize: '0.9375rem', fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'var(--font-sans)', borderRadius: 8, transition: 'all 0.2s', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        >
                            Vào học ngay 🚀
                        </Link>
                    ) : (
                        <>
                            <Link to="/login" style={{ background: 'none', border: 'none', padding: '6px 14px', fontSize: '0.9375rem', fontWeight: 500, color: '#2267e7ff', cursor: 'pointer', fontFamily: 'var(--font-sans)', borderRadius: 8, transition: 'color 0.2s', textDecoration: 'none' }}
                            >Đăng nhập</Link>
                            <Link to="/register" style={{ background: '#2267e7ff', border: 'none', padding: '6px 14px', fontSize: '0.9375rem', fontWeight: 500, color: '#fff', cursor: 'pointer', fontFamily: 'var(--font-sans)', borderRadius: 8, transition: 'color 0.2s', textDecoration: 'none' }}
                            >Đăng ký</Link>
                        </>
                    )}
                </div>
            </div>
        </header>
    )
}
