import { useEffect, useState } from 'react'

export function HeroSection() {
    const [offsetY, setOffsetY] = useState(0)

    useEffect(() => {
        const onScroll = () => setOffsetY(window.scrollY)
        window.addEventListener('scroll', onScroll, { passive: true })
        return () => window.removeEventListener('scroll', onScroll)
    }, [])

    return (
        <section style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', position: 'relative', overflow: 'hidden', paddingTop: 68 }}>
            <div style={{ position: 'absolute', inset: 0, transform: `translateY(${offsetY * 0.25}px)`, pointerEvents: 'none', willChange: 'transform' }}>
                <div style={{ position: 'absolute', top: '10%', right: '5%', width: '55%', height: '80%', background: 'radial-gradient(ellipse 70% 70% at 60% 40%, rgba(19,125,197,0.13) 0%, transparent 70%)' }} />
                <div style={{ position: 'absolute', bottom: '5%', left: '5%', width: '40%', height: '50%', background: 'radial-gradient(ellipse 60% 60% at 40% 60%, rgba(250,207,57,0.1) 0%, transparent 70%)' }} />
            </div>

            <div className="container-app" style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center', padding: '80px 24px' }}>
                <div className="animate-fade-up">

                    <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(2.5rem, 4.5vw, 4rem)', fontWeight: 700, lineHeight: 1.12, letterSpacing: '-0.03em', color: 'var(--color-text-primary)', marginBottom: 24 }}>
                        Làm chủ tiếng Anh
                        <br />cùng{' '}
                        <span style={{ color: 'var(--color-primary)', position: 'relative', display: 'inline-block' }}>
                            AI Tutor
                            <svg viewBox="0 0 200 16" style={{ position: 'absolute', bottom: -6, left: 0, width: '100%', height: 10 }}>
                                <path d="M4,12 Q50,2 100,10 Q150,18 196,8" stroke="var(--color-accent)" strokeWidth="3" fill="none" strokeLinecap="round" />
                            </svg>
                        </span>
                    </h1>

                    <p style={{ fontSize: '1.125rem', color: 'var(--color-text-secondary)', lineHeight: 1.75, marginBottom: 36, maxWidth: 480 }}>
                        Lộ trình học cá nhân hóa với AI thích ứng theo trình độ của bạn. Luyện tập Nghe, Nói, Đọc & Viết — nhận điểm tức thì và phản hồi chi tiết.
                    </p>

                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 48 }}>
                        <RocketButton />
                    </div>

                    <div style={{ display: 'flex', gap: 24, paddingTop: 32, borderTop: '1px solid var(--color-border)' }}>
                        {[{ value: '50K+', label: 'Học viên', icon: '👥' }, { value: '95%', label: 'Tỷ lệ đỗ', icon: '🎯' }, { value: '4.9★', label: 'Đánh giá', icon: '⭐' }].map((s) => (
                            <div key={s.label}>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: '1.625rem', fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1, fontFamily: 'var(--font-sans)' }}>
                                    <span style={{ fontSize: '1.1rem' }}>{s.icon}</span>{s.value}
                                </div>
                                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginTop: 4 }}>{s.label}</div>
                            </div>
                        ))}
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
                    <AITutorIllustration />
                </div>
            </div>
        </section>
    )
}

function PlayIcon() {
    return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" /><path d="M6.5 5.5l4 2.5-4 2.5V5.5z" fill="currentColor" /></svg>
}

function AITutorIllustration() {
    return (
        <div style={{ position: 'relative', width: 480, height: 480 }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'radial-gradient(ellipse at center, rgba(19,125,197,0.15) 0%, transparent 70%)', animation: 'pulseSlow 4s ease-in-out infinite' }} />
            {[1, 2, 3].map((i) => (
                <div key={i} style={{ position: 'absolute', inset: `${i * 40}px`, borderRadius: '50%', border: `1px solid rgba(19,125,197,${0.12 - i * 0.03})`, animation: `pulseSlow ${3 + i * 0.8}s ease-in-out infinite`, animationDelay: `${i * 0.3}s` }} />
            ))}
            <div style={{ position: 'absolute', inset: '25%', borderRadius: '50%', background: 'linear-gradient(135deg, #137dc5 0%, #0c5a92 60%, #0d1b2a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 20px 60px rgba(19,125,197,0.4), 0 0 0 1px rgba(255,255,255,0.1) inset', overflow: 'hidden' }}>
                <svg width="80" height="100" viewBox="0 0 80 100" fill="none">
                    <circle cx="40" cy="22" r="14" fill="rgba(255,255,255,0.9)" />
                    <path d="M16 70c0-13.25 10.745-24 24-24s24 10.75 24 24" fill="rgba(255,255,255,0.75)" />
                    <circle cx="40" cy="22" r="9" fill="#137dc5" opacity="0.6" />
                    <circle cx="37" cy="20" r="3" fill="rgba(255,255,255,0.8)" />
                </svg>
            </div>
            <AudioWaveRings />
            <FloatingCard style={{ top: '8%', right: '2%' }} icon="🎯" title="Điểm AI" value="Band 7.5" color="var(--color-primary)" />
            <FloatingCard style={{ bottom: '10%', left: '2%' }} icon="🔥" title="Chuỗi" value="14 Ngày" color="var(--color-accent-dark)" accent />
            <FloatingCard style={{ top: '45%', right: '-5%' }} icon="💡" title="Bài học" value="Reading" color="#7c3aed" small />
        </div>
    )
}

function AudioWaveRings() {
    const bars = [0.35, 0.6, 0.9, 1, 0.85, 0.55, 0.3, 0.5, 0.8, 0.95, 0.7, 0.4]
    return (
        <div style={{ position: 'absolute', inset: '25%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, opacity: 0.35, pointerEvents: 'none' }}>
            {bars.map((h, i) => (
                <div key={i} style={{ width: 3, height: `${h * 40}%`, borderRadius: 2, background: '#fff', animation: 'waveBar 1.2s ease-in-out infinite', animationDelay: `${i * 0.1}s` }} />
            ))}
            <style>{`@keyframes waveBar { 0%, 100% { transform: scaleY(0.4); opacity: 0.5; } 50% { transform: scaleY(1); opacity: 1; } }`}</style>
        </div>
    )
}

interface FloatingCardProps {
    style: React.CSSProperties
    icon: string
    title: string
    value: string
    color: string
    accent?: boolean
    small?: boolean
}

function FloatingCard({ style, icon, title, value, color, accent, small }: FloatingCardProps) {
    return (
        <div style={{ position: 'absolute', background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(16px)', border: `1px solid ${color}22`, borderRadius: 14, padding: small ? '8px 12px' : '12px 16px', boxShadow: `0 8px 32px rgba(13,27,42,0.12)`, display: 'flex', alignItems: 'center', gap: small ? 8 : 10, animation: 'floatCard 4s ease-in-out infinite', animationDelay: accent ? '1s' : small ? '2s' : '0s', ...style }}>
            <div style={{ width: small ? 28 : 34, height: small ? 28 : 34, borderRadius: 8, background: accent ? 'rgba(250,207,57,0.2)' : `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: small ? 14 : 18, flexShrink: 0 }}>{icon}</div>
            <div>
                <div style={{ fontSize: small ? '0.6875rem' : '0.75rem', color: 'var(--color-text-muted)', fontWeight: 500, lineHeight: 1 }}>{title}</div>
                <div style={{ fontSize: small ? '0.8125rem' : '0.9375rem', fontWeight: 700, color, lineHeight: 1.3, marginTop: 2 }}>{value}</div>
            </div>
            <style>{`@keyframes floatCard { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-8px); } }`}</style>
        </div>
    )
}

function RocketButton() {
    const [isAnimating, setIsAnimating] = useState(false)

    const handleClick = () => {
        if (isAnimating) return;
        setIsAnimating(true);
        setTimeout(() => setIsAnimating(false), 1500);
    }

    return (
        <button
            onClick={handleClick}
            style={{
                position: 'relative',
                padding: '16px 36px',
                background: 'linear-gradient(135deg, var(--color-primary) 0%, #0c5a92 100%)',
                color: 'white',
                fontWeight: 700,
                fontSize: '1.0625rem',
                borderRadius: '12px',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                boxShadow: '0 8px 24px rgba(19,125,197,0.3)',
                overflow: 'hidden',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '12px',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-3px)';
                e.currentTarget.style.boxShadow = '0 12px 32px rgba(19,125,197,0.4)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(19,125,197,0.3)';
            }}
        >
            <span style={{ position: 'relative', zIndex: 1, letterSpacing: '0.01em' }}>Bắt đầu học ngay</span>
            <span style={{ fontSize: '1.25rem', position: 'relative', zIndex: 1 }}>✨</span>

            {isAnimating && (
                <>
                    <div style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        height: '3px',
                        background: 'linear-gradient(90deg, transparent, #fbbf24, #fff)',
                        animation: 'trailGrow 1.5s cubic-bezier(0.5, 0, 0.2, 1) forwards',
                        zIndex: 2,
                        borderRadius: '0 2px 2px 0'
                    }} />

                    <div style={{
                        position: 'absolute',
                        bottom: '-12px',
                        marginLeft: '-15px',
                        fontSize: '24px',
                        animation: 'rocketMove 1.5s cubic-bezier(0.5, 0, 0.2, 1) forwards',
                        zIndex: 3,
                        filter: 'drop-shadow(0px 0px 8px rgba(251, 191, 36, 0.8))'
                    }}>
                        🚀
                    </div>
                </>
            )}

            <style>{`
                @keyframes rocketMove {
                    0% { left: 0%; transform: rotate(45deg) scale(0); opacity: 0; }
                    10% { left: 5%; transform: rotate(45deg) scale(1.1); opacity: 1; }
                    80% { left: 95%; transform: rotate(45deg) scale(1); opacity: 1; }
                    100% { left: 110%; transform: rotate(45deg) scale(0) translateY(-20px) translateX(20px); opacity: 0; }
                }
                @keyframes trailGrow {
                    0% { width: 0; opacity: 1; }
                    80% { width: 100%; opacity: 1; }
                    100% { width: 100%; opacity: 0; }
                }
            `}</style>
        </button>
    )
}

