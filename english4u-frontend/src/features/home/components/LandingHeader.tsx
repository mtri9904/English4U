import { useState, useEffect } from 'react'
import { Button } from '@/shared/ui/Button'

const NAV_LINKS = [
    { label: 'Courses', href: '#features' },
    { label: 'Exams', href: '#exams' },
    { label: 'Flashcards', href: '#flashcards' },
    { label: 'Pricing', href: '#pricing' },
]

export function LandingHeader() {
    const [scrolled, setScrolled] = useState(false)

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 20)
        window.addEventListener('scroll', onScroll, { passive: true })
        return () => window.removeEventListener('scroll', onScroll)
    }, [])

    const handleNav = (href: string) => {
        document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' })
    }

    return (
        <header style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000, transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)', background: scrolled ? 'rgba(255,255,255,0.88)' : 'transparent', backdropFilter: scrolled ? 'blur(20px)' : 'none', borderBottom: scrolled ? '1px solid rgba(19,125,197,0.1)' : '1px solid transparent', boxShadow: scrolled ? '0 4px 24px rgba(13,27,42,0.08)' : 'none' }}>
            <div className="container-app" style={{ display: 'flex', alignItems: 'center', height: 68, gap: 32 }}>
                <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flexShrink: 0 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg, #137dc5 0%, #0c5a92 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 20, fontFamily: 'var(--font-serif)', boxShadow: '0 4px 12px rgba(19,125,197,0.3)' }}>E</div>
                    <span style={{ fontFamily: 'var(--font-serif)', fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>English4U</span>
                </a>

                <nav style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 4 }}>
                    {NAV_LINKS.map((link) => (
                        <button key={link.label} onClick={() => handleNav(link.href)}
                            style={{ background: 'none', border: 'none', padding: '6px 16px', fontSize: '0.9375rem', fontWeight: 500, color: 'var(--color-text-secondary)', borderRadius: 8, cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'var(--font-sans)' }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-primary)'; e.currentTarget.style.background = 'var(--color-primary-light)' }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.background = 'none' }}
                        >{link.label}</button>
                    ))}
                </nav>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                    <button style={{ background: 'none', border: 'none', padding: '6px 14px', fontSize: '0.9375rem', fontWeight: 500, color: 'var(--color-text-secondary)', cursor: 'pointer', fontFamily: 'var(--font-sans)', borderRadius: 8, transition: 'color 0.2s' }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
                    >Sign In</button>
                    <Button variant="primary" size="sm">Get Started →</Button>
                </div>
            </div>
        </header>
    )
}
