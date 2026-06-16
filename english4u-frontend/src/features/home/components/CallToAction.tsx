import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { isTokenExpired } from '@/apis/axios.instance'
import { FadeIn } from './FeaturesSection'

export function CallToAction() {
    const navigate = useNavigate()
    const [hoveredBtn, setHoveredBtn] = useState<'primary' | 'secondary' | null>(null)

    const handleStart = () => {
        if (!isTokenExpired()) {
            navigate('/app')
        } else {
            navigate('/register')
        }
    }

    const handleLogin = () => {
        navigate('/login')
    }

    return (
        <section id="cta" style={{ padding: '80px 24px', background: '#f8fafc', position: 'relative' }}>
            <div className="container-app">
                <FadeIn>
                    <div style={{
                        background: 'linear-gradient(135deg, #0d1b2a 0%, #137dc5 50%, #7c3aed 100%)',
                        borderRadius: 32,
                        padding: '80px 40px',
                        textAlign: 'center',
                        color: '#ffffff',
                        position: 'relative',
                        overflow: 'hidden',
                        boxShadow: '0 30px 70px rgba(19, 125, 197, 0.25)'
                    }}>
                        {/* Decorative floating lights */}
                        <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '30%', height: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%)', pointerEvents: 'none' }} />
                        <div style={{ position: 'absolute', bottom: '-20%', right: '-10%', width: '40%', height: '60%', background: 'radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />

                        <div style={{ position: 'relative', zIndex: 2, maxWidth: 650, margin: '0 auto' }}>
                            <h2 style={{
                                fontFamily: 'var(--font-serif)',
                                fontSize: 'clamp(2.25rem, 4.5vw, 3.25rem)',
                                fontWeight: 700,
                                lineHeight: 1.2,
                                letterSpacing: '-0.02em',
                                marginBottom: 20
                            }}>
                                Chinh phục mục tiêu tiếng Anh cùng AI ngay hôm nay
                            </h2>
                            <p style={{
                                fontSize: '1.125rem',
                                color: 'rgba(255, 255, 255, 0.85)',
                                lineHeight: 1.75,
                                marginBottom: 40,
                                fontWeight: 500
                            }}>
                                Bắt đầu làm bài thi thử IELTS chất lượng hoặc tự luyện phát âm và viết luận cùng trợ lý ảo thông minh. Đăng ký tài khoản miễn phí chỉ trong 30 giây.
                            </p>

                            <div style={{
                                display: 'flex',
                                gap: 16,
                                justifyContent: 'center',
                                flexWrap: 'wrap'
                            }}>
                                <button
                                    onClick={handleStart}
                                    onMouseEnter={() => setHoveredBtn('primary')}
                                    onMouseLeave={() => setHoveredBtn(null)}
                                    style={{
                                        padding: '16px 36px',
                                        background: '#ffffff',
                                        color: '#137dc5',
                                        border: 'none',
                                        borderRadius: 'var(--radius-xl)',
                                        fontWeight: 800,
                                        fontSize: '1rem',
                                        fontFamily: 'var(--font-sans)',
                                        cursor: 'pointer',
                                        boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
                                        transform: hoveredBtn === 'primary' ? 'translateY(-3px)' : 'translateY(0)',
                                        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
                                    }}
                                >
                                    Bắt đầu học ngay 🚀
                                </button>

                                <button
                                    onClick={handleLogin}
                                    onMouseEnter={() => setHoveredBtn('secondary')}
                                    onMouseLeave={() => setHoveredBtn(null)}
                                    style={{
                                        padding: '16px 36px',
                                        color: '#ffffff',
                                        border: '1.5px solid rgba(255, 255, 255, 0.4)',
                                        borderRadius: 'var(--radius-xl)',
                                        fontWeight: 700,
                                        fontSize: '1rem',
                                        fontFamily: 'var(--font-sans)',
                                        cursor: 'pointer',
                                        backdropFilter: 'blur(8px)',
                                        transform: hoveredBtn === 'secondary' ? 'translateY(-3px)' : 'translateY(0)',
                                        background: hoveredBtn === 'secondary' ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.12)',
                                        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
                                    }}
                                >
                                    Đăng nhập tài khoản
                                </button>
                            </div>
                        </div>
                    </div>
                </FadeIn>
            </div>
        </section>
    )
}
