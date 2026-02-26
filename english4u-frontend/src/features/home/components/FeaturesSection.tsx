import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/shared/ui/Badge'
import { ProgressBar } from '@/shared/ui/ProgressBar'

interface Skill {
    id: string; icon: string; title: string; description: string; color: string; bg: string; progress: number; tag: string; features: string[]; animated?: boolean
}

const SKILLS: Skill[] = [
    { id: 'listening', icon: '🎧', title: 'Listening', description: 'Luyện nghe với các bản thu IELTS, podcast và audio đời thực. AI tự động phát hiện các lỗ hổng nghe hiểu của bạn.', color: '#137dc5', bg: 'rgba(19,125,197,0.08)', progress: 78, tag: 'IELTS Band 7+', features: ['Bản thu thực tế', 'Kiểm soát tốc độ', 'Bài tập điền từ'] },
    { id: 'speaking', icon: '🎙️', title: 'Speaking', description: 'Giao tiếp trực tiếp với AI và nhận điểm phát âm lập tức. Phân tích sóng âm giúp bạn hoàn thiện ngữ điệu chuẩn xác.', color: '#7c3aed', bg: 'rgba(124,58,237,0.08)', progress: 65, tag: 'Phát âm AI', features: ['Chấm điểm thời gian thực', 'Phản hồi qua sóng âm', 'Luyện tập ngữ điệu'], animated: true },
    { id: 'reading', icon: '📖', title: 'Reading', description: 'Bài đọc thích ứng từ trình độ C1 đến IELTS Academic. Hệ thống tự động đo lường tốc độ đọc hiểu qua từng cấp độ.', color: '#0891b2', bg: 'rgba(8,145,178,0.08)', progress: 82, tag: 'Cấp độ thích ứng', features: ['Bài đọc chuẩn IELTS', 'Đo tốc độ đọc', 'Kho từ vựng'] },
    { id: 'writing', icon: '✏️', title: 'Writing', description: 'Nộp bài luận và nhận điểm chuẩn IELTS kèm nhận xét chi tiết về ngữ pháp, từ vựng và tính mạch lạc chỉ trong vài giây.', color: '#c2410c', bg: 'rgba(194,65,12,0.08)', progress: 71, tag: 'Phản hồi tức thì', features: ['Chấm điểm bằng AI', 'Sửa lỗi ngữ pháp', 'Cấu trúc bài luận'] },
]

export function FeaturesSection() {
    return (
        <section id="features" style={{ padding: '100px 24px', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, var(--color-border-strong), transparent)' }} />
            <div className="container-app">
                <FadeIn>
                    <div style={{ textAlign: 'center', marginBottom: 64 }}>
                        <p className="text-label" style={{ marginBottom: 12 }}>Bốn Kỹ Năng Cốt Lõi</p>
                        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(2rem, 3.5vw, 2.75rem)', fontWeight: 700, letterSpacing: '-0.025em', marginBottom: 16, color: 'var(--color-text-primary)' }}>
                            Mọi thứ bạn cần để đạt<span style={{ color: 'var(--color-primary)' }}> Band 7+</span>
                        </h2>
                        <p style={{ fontSize: '1.0625rem', color: 'var(--color-text-secondary)', maxWidth: 520, margin: '0 auto', lineHeight: 1.7 }}>
                            Các mô-đun tích hợp sức mạnh AI bao quát mọi cấu phần của bài thi IELTS & TOEFL, phân bổ độ khó theo đúng trình độ hiện tại của bạn.
                        </p>
                    </div>
                </FadeIn>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
                    {SKILLS.map((skill, i) => (
                        <FadeIn key={skill.id} delay={i * 100}><SkillCard skill={skill} /></FadeIn>
                    ))}
                </div>
            </div>
        </section>
    )
}

function SkillCard({ skill }: { skill: Skill }) {
    const [hovered, setHovered] = useState(false)
    return (
        <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
            style={{ background: 'rgba(255,255,255,0.8)', border: `1.5px solid ${hovered ? skill.color + '40' : 'var(--color-border)'}`, borderRadius: 20, padding: 28, cursor: 'default', transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)', boxShadow: hovered ? '0 20px 48px rgba(13,27,42,0.12)' : 'var(--shadow-sm)', transform: hovered ? 'translateY(-4px)' : 'translateY(0)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, right: 0, width: 120, height: 120, background: `radial-gradient(ellipse at 80% 20%, ${skill.color}14 0%, transparent 70%)`, borderRadius: '0 20px 0 0', opacity: hovered ? 1 : 0.5, transition: 'opacity 0.3s' }} />
            <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
                    <div style={{ width: 52, height: 52, borderRadius: 14, background: skill.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, transition: 'transform 0.2s', transform: hovered ? 'scale(1.1) rotate(-5deg)' : 'scale(1)' }}>{skill.icon}</div>
                    <Badge variant="neutral">{skill.tag}</Badge>
                </div>
                <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 10 }}>{skill.title}</h3>
                <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', lineHeight: 1.7, marginBottom: 20 }}>{skill.description}</p>
                {skill.animated ? <SpeakingWave color={skill.color} active={hovered} /> : (
                    <div style={{ marginBottom: 20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
                            <span>Cải thiện trung bình</span><span style={{ color: skill.color, fontWeight: 700 }}>+{skill.progress}%</span>
                        </div>
                        <ProgressBar value={skill.progress} variant="primary" size="sm" />
                    </div>
                )}
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {skill.features.map((f) => (
                        <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8125rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                            <span style={{ width: 16, height: 16, borderRadius: '50%', background: skill.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: skill.color, fontSize: 9, fontWeight: 800, flexShrink: 0 }}>✓</span>
                            {f}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    )
}

function SpeakingWave({ color, active }: { color: string; active: boolean }) {
    const COUNT = 20
    return (
        <div style={{ display: 'flex', alignItems: 'center', height: 56, gap: 3, marginBottom: 20, padding: '8px 12px', background: `${color}0c`, borderRadius: 12, border: `1px solid ${color}20` }}>
            {Array.from({ length: COUNT }, (_, i) => (
                <div key={i} style={{ flex: 1, borderRadius: 2, background: `linear-gradient(180deg, ${color} 0%, ${color}88 100%)`, height: `${(active ? Math.sin((i / COUNT) * Math.PI) * 0.7 + 0.3 : 0.15) * 100}%`, animation: active ? 'speakWave 0.8s ease-in-out infinite' : 'none', animationDelay: `${i * 0.04}s` }} />
            ))}
            <style>{`@keyframes speakWave { 0%, 100% { transform: scaleY(0.3); } 50% { transform: scaleY(1); } }`}</style>
        </div>
    )
}

export function FadeIn({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
    const ref = useRef<HTMLDivElement>(null)
    const [visible, setVisible] = useState(false)
    useEffect(() => {
        const el = ref.current
        if (!el) return
        const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect() } }, { threshold: 0.1 })
        obs.observe(el)
        return () => obs.disconnect()
    }, [])
    return (
        <div ref={ref} style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(24px)', transition: `opacity 0.6s ease ${delay}ms, transform 0.6s cubic-bezier(0.4,0,0.2,1) ${delay}ms` }}>
            {children}
        </div>
    )
}
