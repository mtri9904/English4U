import { useState, useEffect } from 'react'
import { Badge } from '@/shared/ui/Badge'
import { FadeIn } from './FeaturesSection'
import { SpeakingExaminerModel } from '@/features/client/components/speaking/SpeakingExaminerModel'

type Status = 'speaking_prompt' | 'idle' | 'recording' | 'analyzing' | 'done'
type Viseme = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'X'

export function SpeakingCoachDemo() {
    const [status, setStatus] = useState<Status>('speaking_prompt')
    const [viseme, setViseme] = useState<Viseme>('X')
    const [seconds, setSeconds] = useState(0)
    const [micLevel, setMicLevel] = useState(0)
    const [isModelAvailable, setIsModelAvailable] = useState(false)

    // Simulate viseme mouth movement when examiner speaks prompt
    useEffect(() => {
        let timer: any
        if (status === 'speaking_prompt') {
            const visemes: Viseme[] = ['A', 'C', 'X', 'D', 'G', 'F', 'X', 'C', 'A', 'X']
            let idx = 0
            timer = setInterval(() => {
                setViseme(visemes[idx % visemes.length])
                idx++
                if (idx > 15) {
                    clearInterval(timer)
                    setViseme('X')
                    setStatus('idle')
                }
            }, 250)
        }
        return () => clearInterval(timer)
    }, [status])

    // Simulate microphone level during recording
    useEffect(() => {
        let timer: any
        if (status === 'recording') {
            timer = setInterval(() => {
                setMicLevel(Math.random())
                setSeconds((prev) => {
                    if (prev >= 4) {
                        clearInterval(timer)
                        setStatus('analyzing')
                        return 0
                    }
                    return prev + 1
                })
            }, 1000)
        } else {
            setMicLevel(0)
        }
        return () => clearInterval(timer)
    }, [status])

    useEffect(() => {
        if (status === 'analyzing') {
            const timer = setTimeout(() => {
                setStatus('done')
            }, 2200)
            return () => clearTimeout(timer)
        }
    }, [status])

    const startRecording = () => {
        setSeconds(0)
        setStatus('recording')
    }

    const stopRecording = () => {
        setStatus('analyzing')
    }

    const resetDemo = () => {
        setStatus('speaking_prompt')
    }

    const getAvatarStatus = () => {
        switch (status) {
            case 'speaking_prompt': return 'Examiner đang nói'
            case 'recording': return 'Candidate đang nói'
            case 'analyzing': return 'AI đang phân tích...'
            default: return 'Examiner chờ phản hồi'
        }
    }

    const getAvatarAccent = () => {
        if (status === 'recording') return '#fee2e2'
        if (status === 'speaking_prompt') return '#dbeafe'
        return '#f1f5f9'
    }

    const speakerLevel = status === 'speaking_prompt' ? 0.35 : status === 'recording' ? micLevel : 0.06
    const eyeScaleY = status === 'speaking_prompt' || status === 'recording' ? 0.72 : 1

    return (
        <section id="speaking-coach" style={{ padding: '100px 24px', position: 'relative', background: '#ffffff' }}>
            <div className="container-app">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 48, alignItems: 'center' }}>

                    {/* Left Column: Description */}
                    <FadeIn>
                        <div>
                            <span style={{
                                display: 'inline-block',
                                padding: '6px 16px',
                                background: 'rgba(239, 68, 68, 0.08)',
                                color: '#ef4444',
                                borderRadius: 'var(--radius-full)',
                                fontSize: '0.8125rem',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                marginBottom: 16
                            }}>
                                🎙️ AI Speaking Examiner
                            </span>
                            <h2 style={{
                                fontFamily: 'var(--font-sans)',
                                fontSize: 'clamp(2rem, 3.5vw, 2.75rem)',
                                fontWeight: 800,
                                marginBottom: 20,
                                color: 'var(--color-text-primary)',
                                lineHeight: 1.2
                            }}>
                                Luyện nói cùng <span style={{ color: '#ef4444' }}>3D Avatar Examiner</span> tương tác thời gian thực
                            </h2>
                            <p style={{ fontSize: '1.0625rem', color: 'var(--color-text-secondary)', lineHeight: 1.7, marginBottom: 28 }}>
                                Trải nghiệm thi thử IELTS Speaking độc đáo với <strong>Examiner Avatar</strong> đồng bộ cử động môi theo visemes (Lip-sync) nhờ công nghệ Gemini Speech. Câu trả lời của bạn được phân tích toàn diện từ nhịp điệu (Pace), độ bao phủ (Coverage) đến độ chuẩn xác của từng âm tiết.
                            </p>

                            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 16, padding: 0 }}>
                                {[
                                    { text: 'Lip-sync 3D Examiner phát câu hỏi tự nhiên.', label: '✓' },
                                    { text: 'Chấm điểm tự động theo đúng 4 tiêu chí IELTS Speaking.', label: '✓' },
                                    { text: 'Báo cáo Speaking Analytics: Đo tốc độ nói (WPM), ngắt quãng (Pause) & từ vựng có độ tin cậy thấp.', label: '✓' }
                                ].map((item, idx) => (
                                    <li key={idx} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                                        <span style={{
                                            width: 24,
                                            height: 24,
                                            borderRadius: '50%',
                                            background: 'rgba(239, 68, 68, 0.08)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: '#ef4444',
                                            fontWeight: 800,
                                            fontSize: '0.875rem',
                                            flexShrink: 0
                                        }}>
                                            {item.label}
                                        </span>
                                        <span style={{ fontSize: '0.9375rem', color: 'var(--color-text-secondary)', fontWeight: 500, lineHeight: 1.5 }}>
                                            {item.text}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </FadeIn>

                    {/* Right Column: Interactive Speaking Canvas Mockup */}
                    <FadeIn delay={150}>
                        <div style={{
                            background: 'linear-gradient(180deg, #eff6ff 0%, #f8fafc 100%)',
                            border: '1.5px solid var(--color-border)',
                            borderRadius: 24,
                            padding: '24px',
                            boxShadow: '0 20px 48px rgba(15, 23, 42, 0.06)',
                            position: 'relative'
                        }}>

                            {/* Speaking Canvas Area */}
                            <div style={{
                                position: 'relative',
                                minHeight: 340,
                                borderRadius: 20,
                                background: 'radial-gradient(circle at 50% 24%, #bfdbfe 0%, #93c5fd 30%, #2563eb 100%)',
                                display: 'grid',
                                placeItems: 'center',
                                overflow: 'hidden',
                                marginBottom: 20
                            }}>
                                {/* Examiner Status Chip */}
                                <div style={{
                                    position: 'absolute',
                                    top: 18,
                                    left: 18,
                                    background: 'rgba(255, 255, 255, 0.76)',
                                    padding: '4px 12px',
                                    borderRadius: 99,
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    color: '#1e3a8a',
                                    zIndex: 2
                                }}>
                                    {getAvatarStatus()}
                                </div>

                                {/* Actual 3D Examiner Model */}
                                <SpeakingExaminerModel
                                    activeViseme={viseme}
                                    audioLevel={speakerLevel}
                                    isPromptPlaying={status === 'speaking_prompt'}
                                    isRecording={status === 'recording'}
                                    onAvailabilityChange={setIsModelAvailable}
                                />

                                {/* Fallback Face - 3D Mockup if model is not loaded/available */}
                                {!isModelAvailable && (
                                    <div style={{
                                        width: 150,
                                        height: 150,
                                        borderRadius: '50%',
                                        background: '#f8fafc',
                                        boxShadow: `0 15px 35px rgba(15, 23, 42, ${0.15 + speakerLevel * 0.15})`,
                                        display: 'grid',
                                        placeItems: 'center',
                                        position: 'relative',
                                        transform: `translateY(${status === 'speaking_prompt' ? -2 : 0}px)`,
                                        transition: 'transform 140ms ease, box-shadow 140ms ease',
                                        border: `8px solid ${getAvatarAccent()}`
                                    }}>
                                        {/* Left Eye */}
                                        <div style={{
                                            position: 'absolute',
                                            top: 52,
                                            left: 36,
                                            width: 16,
                                            height: 14,
                                            borderRadius: '50%',
                                            background: '#0f172a',
                                            transform: `scaleY(${eyeScaleY})`,
                                            transition: 'transform 140ms ease'
                                        }} />
                                        {/* Right Eye */}
                                        <div style={{
                                            position: 'absolute',
                                            top: 52,
                                            right: 36,
                                            width: 16,
                                            height: 14,
                                            borderRadius: '50%',
                                            background: '#0f172a',
                                            transform: `scaleY(${eyeScaleY})`,
                                            transition: 'transform 140ms ease'
                                        }} />
                                        {/* Nose */}
                                        <div style={{
                                            position: 'absolute',
                                            top: 80,
                                            width: 8,
                                            height: 20,
                                            borderRadius: 999,
                                            background: '#cbd5e1'
                                        }} />
                                        {/* Mouth */}
                                        <div style={{
                                            position: 'absolute',
                                            bottom: 32,
                                            transition: 'all 120ms ease',
                                            ...(viseme === 'A' ? { width: 44, height: 26, borderRadius: '44% 44% 54% 54%', background: '#7f1d1d' } :
                                                viseme === 'C' ? { width: 48, height: 18, borderRadius: '99px 99px 12px 12px', background: '#991b1b' } :
                                                    viseme === 'D' ? { width: 42, height: 14, borderRadius: 999, background: '#fff7ed', border: '2px solid #0f172a' } :
                                                        viseme === 'F' ? { width: 34, height: 22, borderRadius: '48% 48% 55% 55%', background: '#7f1d1d' } :
                                                            viseme === 'G' ? { width: 40, height: 12, borderRadius: 999, background: '#ef4444' } :
                                                                { width: 40, height: 6, borderRadius: 999, background: status === 'recording' ? '#dc2626' : '#0f172a' }) // Viseme 'X' (Idle)
                                        }} />
                                    </div>
                                )}

                                {/* Active waveform at bottom of avatar */}
                                <div style={{
                                    position: 'absolute',
                                    left: 20,
                                    right: 20,
                                    bottom: 18,
                                    display: 'flex',
                                    alignItems: 'flex-end',
                                    justifyContent: 'center',
                                    gap: 4,
                                    height: 50,
                                    pointerEvents: 'none',
                                    zIndex: 2
                                }}>
                                    {Array.from({ length: 14 }).map((_, i) => {
                                        const dist = Math.abs(i - 6.5)
                                        const intensity = Math.max(0.1, speakerLevel * (1 - dist / 14))
                                        const barHeight = Math.max(8, Math.round(12 + intensity * 42))
                                        return (
                                            <div key={i} style={{
                                                width: 6,
                                                height: `${barHeight}px`,
                                                borderRadius: 99,
                                                background: status === 'recording' ? '#ef4444' : '#ffffff',
                                                opacity: Math.min(1, 0.3 + intensity),
                                                transition: 'height 90ms linear, opacity 90ms linear'
                                            }} />
                                        )
                                    })}
                                </div>
                            </div>

                            {/* Control Description Area */}
                            <div style={{ minHeight: 120, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                {status === 'speaking_prompt' && (
                                    <div style={{ textAlign: 'center', animation: 'fadeIn 0.3s ease-out' }}>
                                        <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', fontWeight: 700, display: 'block', marginBottom: 4 }}>EXAMINER QUESTION:</span>
                                        <p style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 16px' }}>
                                            "Let's talk about books. What kind of books do you like to read?"
                                        </p>
                                        <div style={{ height: 12 }} />
                                    </div>
                                )}

                                {status === 'idle' && (
                                    <div style={{ textAlign: 'center', animation: 'fadeIn 0.3s ease-out' }}>
                                        <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', fontWeight: 700, display: 'block', marginBottom: 6 }}>BẮT ĐẦU TRẢ LỜI:</span>
                                        <button
                                            onClick={startRecording}
                                            style={{
                                                padding: '12px 28px',
                                                background: 'var(--color-primary)',
                                                color: '#fff',
                                                border: 'none',
                                                borderRadius: 12,
                                                fontWeight: 700,
                                                fontSize: '0.875rem',
                                                cursor: 'pointer',
                                                boxShadow: '0 4px 12px rgba(19, 125, 197, 0.25)',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: 8
                                            }}
                                        >
                                            🎙️ Nhấn Micro để trả lời
                                        </button>
                                    </div>
                                )}

                                {status === 'recording' && (
                                    <div style={{ textAlign: 'center', width: '100%', animation: 'fadeIn 0.3s ease-out' }}>
                                        <span style={{ fontSize: '0.8125rem', color: 'var(--color-error)', fontWeight: 700, display: 'block', marginBottom: 8, letterSpacing: '0.05em' }}>MICRO ĐANG GHI ÂM: {seconds}s / 45s</span>
                                        <button
                                            onClick={stopRecording}
                                            style={{
                                                padding: '10px 24px',
                                                borderRadius: 12,
                                                border: 'none',
                                                background: 'var(--color-error)',
                                                color: '#fff',
                                                fontWeight: 700,
                                                fontSize: '0.875rem',
                                                cursor: 'pointer',
                                                boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: 8
                                            }}
                                        >
                                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff', animation: 'blink 1s infinite' }} />
                                            Dừng & Nộp bài chấm AI
                                        </button>
                                    </div>
                                )}

                                {status === 'analyzing' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                                        <div className="spinner-mini" style={{
                                            width: 24,
                                            height: 24,
                                            border: '2.5px solid rgba(37, 99, 235, 0.2)',
                                            borderTopColor: 'var(--color-primary)',
                                            borderRadius: '50%',
                                            animation: 'spin 0.8s linear infinite'
                                        }} />
                                        <span style={{ fontSize: '0.875rem', color: 'var(--color-primary)', fontWeight: 700 }}>AI scoring pipeline đang chấm 4 tiêu chuẩn IELTS...</span>
                                    </div>
                                )}

                                {status === 'done' && (
                                    <div style={{ width: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                                        {/* Question info */}
                                        <div style={{ background: '#f8fafc', border: '1px solid var(--color-border)', borderRadius: 12, padding: '10px 14px', marginBottom: 12 }}>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 700, display: 'block', marginBottom: 4 }}>CÂU HỎI CỦA EXAMINER:</span>
                                            <p style={{ fontSize: '0.875rem', margin: 0, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                                                "Let's talk about books. What kind of books do you like to read?"
                                            </p>
                                        </div>
                                        {/* Transcript area */}
                                        <div style={{ background: '#ffffff', border: '1px solid var(--color-border)', borderRadius: 14, padding: 14, marginBottom: 16 }}>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 700, display: 'block', marginBottom: 4 }}>CÂU TRẢ LỜI CỦA BẠN (ASR):</span>
                                            <p style={{ fontSize: '0.875rem', margin: 0, lineHeight: 1.6, color: 'var(--color-text-primary)' }}>
                                                "Well, I really love reading science fiction books because they are very{' '}
                                                <span style={{
                                                    color: 'var(--color-error)',
                                                    textDecoration: 'underline wavy var(--color-error) 1.5px',
                                                    cursor: 'pointer',
                                                    position: 'relative',
                                                    fontWeight: 600
                                                }} className="speaking-word-hover">
                                                    interesting.
                                                    <span className="speaking-tooltip" style={{
                                                        position: 'absolute',
                                                        bottom: '125%',
                                                        left: '50%',
                                                        transform: 'translateX(-50%)',
                                                        background: 'var(--color-text-primary)',
                                                        color: '#fff',
                                                        padding: '8px 12px',
                                                        borderRadius: 8,
                                                        fontSize: '0.7rem',
                                                        whiteSpace: 'nowrap',
                                                        zIndex: 10,
                                                        boxShadow: 'var(--shadow-md)',
                                                        display: 'none'
                                                    }}>
                                                        ⚠️ ASR Confidence: 48% (Phát âm nuốt âm thứ 3 /tre/)
                                                    </span>
                                                </span>{' '}
                                                Actually, I read them almost every day."
                                            </p>
                                        </div>

                                        {/* IELTS 4 Criteria score card */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
                                            {[
                                                { label: 'Pron', score: '7.5' },
                                                { label: 'Fluency', score: '7.0' },
                                                { label: 'Lexical', score: '7.5' },
                                                { label: 'Grammar', score: '7.0' }
                                            ].map((crit, idx) => (
                                                <div key={idx} style={{ background: '#ffffff', border: '1px solid var(--color-border)', borderRadius: 10, padding: '8px 4px', textAlign: 'center' }}>
                                                    <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>{crit.label}</div>
                                                    <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-primary)', marginTop: 2 }}>{crit.score}</div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Speaking Analytics Widget */}
                                        <div style={{ background: '#f8fafc', border: '1.5px solid var(--color-border)', borderRadius: 14, padding: 14, marginBottom: 16 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontWeight: 700 }}>📊 SPEAKING ANALYTICS:</span>
                                                <Badge variant="success">Pace balanced</Badge>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                                                <div>Tốc độ nói: <strong>125 WPM</strong></div>
                                                <div>Độ dài câu: <strong>on_target (92%)</strong></div>
                                                <div>Tỷ lệ im lặng: <strong>8.5%</strong></div>
                                                <div>Ngắt quãng: <strong>4 lần pause</strong></div>
                                            </div>
                                        </div>

                                        {/* Reset button */}
                                        <button
                                            onClick={resetDemo}
                                            style={{
                                                width: '100%',
                                                padding: '10px',
                                                background: 'transparent',
                                                border: '1.5px solid var(--color-primary)',
                                                borderRadius: 12,
                                                color: 'var(--color-primary)',
                                                fontWeight: 700,
                                                fontSize: '0.8125rem',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: 8
                                            }}
                                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(19, 125, 197, 0.05)' }}
                                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                                        >
                                            🔄 Luyện tập câu khác
                                        </button>
                                    </div>
                                )}
                            </div>

                        </div>
                    </FadeIn>
                </div>
            </div>

            <style>{`
                .speaking-word-hover:hover .speaking-tooltip {
                    display: block !important;
                }
            `}</style>
        </section>
    )
}
