import { useState, useEffect } from 'react'
import { Badge } from '@/shared/ui/Badge'
import { FadeIn } from './FeaturesSection'

export function ExamSimulatorShowcase() {
    const [seconds, setSeconds] = useState(45)
    const [minutes, setMinutes] = useState(59)
    const [activeTab, setActiveTab] = useState<'reading' | 'listening'>('reading')
    const [activePassage, setActivePassage] = useState(1)

    useEffect(() => {
        const timer = setInterval(() => {
            setSeconds((prevSec) => {
                if (prevSec === 0) {
                    setMinutes((prevMin) => (prevMin > 0 ? prevMin - 1 : 59))
                    return 59
                }
                return prevSec - 1
            })
        }, 1000)
        return () => clearInterval(timer)
    }, [])

    return (
        <section id="exam-simulator" style={{ padding: '100px 24px', background: '#f8fafc', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, var(--color-border-strong), transparent)' }} />
            <div className="container-app">
                
                {/* Header Title */}
                <FadeIn>
                    <div style={{ textAlign: 'center', marginBottom: 50 }}>
                        <span style={{ 
                            display: 'inline-block',
                            padding: '6px 16px',
                            background: 'rgba(124, 58, 237, 0.08)',
                            color: 'var(--color-primary)',
                            borderRadius: 'var(--radius-full)',
                            fontSize: '0.8125rem',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            marginBottom: 16
                        }}>
                            🖥️ Exam Simulator
                        </span>
                        <h2 style={{ 
                            fontSize: 'clamp(2rem, 3.5vw, 2.75rem)', 
                            fontWeight: 800, 
                            marginBottom: 20, 
                            color: 'var(--color-text-primary)',
                            lineHeight: 1.2
                        }}>
                            Trình giả lập thi thử <span style={{ color: 'var(--color-primary)' }}>chuẩn xác 100%</span> giao diện thật
                        </h2>
                        <p style={{ fontSize: '1.0625rem', color: 'var(--color-text-secondary)', maxWidth: 650, margin: '0 auto', lineHeight: 1.7 }}>
                            Làm quen hoàn hảo với áp lực thi thật. Trình giả lập tích hợp đầy đủ split-screen chia đôi văn bản/câu hỏi, thanh trạng thái, đồng hồ đếm ngược và navigator 40 câu hỏi đồng bộ với module phòng thi thực tế.
                        </p>
                    </div>
                </FadeIn>

                {/* Main Simulator Card (Browser Window Mockup) */}
                <FadeIn delay={150}>
                    <div style={{
                        background: '#ffffff',
                        border: '1.5px solid var(--color-border)',
                        borderRadius: 24,
                        boxShadow: '0 25px 60px rgba(15, 23, 42, 0.08)',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column'
                    }}>
                        
                        {/* Browser Address Bar */}
                        <div style={{
                            background: '#e2e8f0',
                            padding: '12px 20px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 16,
                            borderBottom: '1.5px solid var(--color-border)'
                        }}>
                            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f56' }} />
                                <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#ffbd2e' }} />
                                <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#27c93f' }} />
                            </div>
                            <div style={{ 
                                background: '#ffffff', 
                                borderRadius: 8, 
                                padding: '4px 16px', 
                                fontSize: '0.75rem', 
                                color: 'var(--color-text-secondary)', 
                                flex: 1,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                maxWidth: 500,
                                border: '1px solid var(--color-border)'
                            }}>
                                🔒 <span style={{ color: 'var(--color-text-muted)' }}>english4u.edu.vn</span>/app/session-runner/ielts-academic-reading-test
                            </div>
                            
                            {/* Skill Selection Controls */}
                            <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                                {[
                                    { id: 'reading', label: '📖 Reading Passage' },
                                    { id: 'listening', label: '🎧 Listening Audio' }
                                ].map((tab) => (
                                    <button 
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id as 'reading' | 'listening')}
                                        style={{
                                            padding: '4px 12px',
                                            borderRadius: 6,
                                            border: 'none',
                                            cursor: 'pointer',
                                            fontSize: '0.75rem',
                                            fontWeight: 700,
                                            transition: 'all 0.2s',
                                            background: activeTab === tab.id ? 'var(--color-primary)' : 'transparent',
                                            color: activeTab === tab.id ? '#fff' : 'var(--color-text-secondary)'
                                        }}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Top App Bar inside Simulator */}
                        <div style={{
                            background: '#f8fafc',
                            borderBottom: '1px solid var(--color-border)',
                            padding: '14px 20px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                <button style={{
                                    background: 'transparent',
                                    border: '1.5px solid var(--color-border-strong)',
                                    borderRadius: 8,
                                    padding: '6px 12px',
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    color: 'var(--color-text-secondary)',
                                    cursor: 'pointer'
                                }}>
                                    ← Exit Test
                                </button>
                                <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                                    IELTS Academic Mock Test #01
                                </span>
                                <Badge variant="primary">Academic</Badge>
                            </div>
                            
                            {/* Countdown Timer */}
                            <div style={{
                                background: 'rgba(239, 68, 68, 0.08)',
                                border: '1px solid rgba(239, 68, 68, 0.15)',
                                color: 'var(--color-error)',
                                padding: '6px 16px',
                                borderRadius: 10,
                                fontSize: '0.875rem',
                                fontWeight: 800,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                fontFamily: 'monospace'
                            }}>
                                ⏱️ {minutes < 10 ? `0${minutes}` : minutes}:{seconds < 10 ? `0${seconds}` : seconds}
                            </div>
                        </div>

                        {/* Split Screen Simulator Body */}
                        <div style={{ 
                            display: 'grid', 
                            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', 
                            height: 400, 
                            background: '#ffffff' 
                        }}>
                            
                            {/* LEFT PANEL: Reading Passage or Listening Player */}
                            <div style={{ 
                                padding: '24px', 
                                borderRight: '1.5px solid var(--color-border)', 
                                overflowY: 'auto',
                                height: '100%'
                            }}>
                                {activeTab === 'reading' ? (
                                    <div style={{ lineHeight: 1.7, fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                                        {/* Passage Selector Tabs */}
                                        <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid var(--color-border)', paddingBottom: 12 }}>
                                            {[1, 2, 3].map((p) => (
                                                <button
                                                    key={p}
                                                    onClick={() => setActivePassage(p)}
                                                    style={{
                                                        padding: '6px 14px',
                                                        borderRadius: 8,
                                                        border: '1.5px solid ' + (activePassage === p ? 'var(--color-primary)' : 'var(--color-border-strong)'),
                                                        background: activePassage === p ? 'rgba(19, 125, 197, 0.08)' : '#ffffff',
                                                        color: activePassage === p ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                                                        fontSize: '0.8125rem',
                                                        fontWeight: 700,
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s'
                                                    }}
                                                >
                                                    Passage {p}
                                                </button>
                                            ))}
                                        </div>

                                        {activePassage === 1 && (
                                            <div>
                                                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: 12 }}>
                                                    The Evolution of Language Acquisition (Passage 1)
                                                </h3>
                                                <p style={{ marginBottom: 12 }}>
                                                    <strong>Paragraph A:</strong> Language acquisition is one of the most remarkable human behaviors. From infancy, children are exposed to a rich stream of linguistic sounds, which they rapidly process to formulate syntactic rules and semantic comprehension.
                                                </p>
                                                <p style={{ marginBottom: 12 }}>
                                                    <strong>Paragraph B:</strong> Early behavioral theories suggest language learning occurs purely through environmental reinforcement. However, modern linguistics proposes that human brains possess an innate capacity for linguistic parsing.
                                                </p>
                                            </div>
                                        )}
                                        {activePassage === 2 && (
                                            <div>
                                                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: 12 }}>
                                                    The Secret Life of Coral Reefs (Passage 2)
                                                </h3>
                                                <p style={{ marginBottom: 12 }}>
                                                    <strong>Paragraph A:</strong> Coral reefs are some of the most diverse ecosystems on the planet. Often referred to as the "rainforests of the sea," they occupy less than 0.1% of the world's ocean surface.
                                                </p>
                                                <p style={{ marginBottom: 12 }}>
                                                    <strong>Paragraph B:</strong> In recent years, climate change and ocean acidification have posed severe threats to coral health. Rising sea temperatures trigger bleaching events.
                                                </p>
                                            </div>
                                        )}
                                        {activePassage === 3 && (
                                            <div>
                                                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: 12 }}>
                                                    Artificial Intelligence in Modern Medicine (Passage 3)
                                                </h3>
                                                <p style={{ marginBottom: 12 }}>
                                                    <strong>Paragraph A:</strong> The integration of artificial intelligence (AI) into clinical settings is transforming healthcare delivery. Deep learning algorithms are now capable of analyzing medical imagery.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div style={{ 
                                        height: '100%',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.02) 0%, rgba(124, 58, 237, 0.02) 100%)',
                                        padding: '20px',
                                        textAlign: 'center'
                                    }}>
                                        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(59, 130, 246, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 16 }}>
                                            🎧
                                        </div>
                                        <h4 style={{ fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 6, fontSize: '0.95rem' }}>
                                            Audio Toàn Bài Thi (Listening Full Audio)
                                        </h4>
                                        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: 20, maxWidth: 300 }}>
                                            Một file âm thanh duy nhất phát liên tục từ Part 1 đến Part 4 cho toàn bộ bài thi Listening.
                                        </p>
                                        
                                        {/* Audio player mockup */}
                                        <div style={{ 
                                            width: '100%', 
                                            maxWidth: 320, 
                                            background: '#ffffff', 
                                            border: '1.5px solid var(--color-border)', 
                                            borderRadius: 12, 
                                            padding: '10px 14px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 12
                                        }}>
                                            <button style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'var(--color-primary)', color: '#fff', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>▶</button>
                                            <div style={{ flex: 1, height: 4, background: '#e2e8f0', borderRadius: 2, position: 'relative' }}>
                                                <div style={{ width: '45%', height: '100%', background: 'var(--color-primary)', borderRadius: 2 }} />
                                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-primary)', position: 'absolute', top: -2, left: '45%' }} />
                                            </div>
                                            <span style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>12:45 / 40:00</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* RIGHT PANEL: Questions sheet */}
                            <div style={{ 
                                padding: '24px', 
                                overflowY: 'auto', 
                                height: '100%',
                                background: '#fafbfc'
                            }}>
                                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 700, display: 'block', marginBottom: 12 }}>
                                    CÂU HỎI TRẢ LỜI:
                                </span>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                                    {activeTab === 'reading' ? (
                                        <div>
                                            <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 8 }}>
                                                Questions 1 - 2 (Passage {activePassage}): Chọn tiêu đề phù hợp:
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.75rem' }}>
                                                    <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)', minWidth: 90 }}>1. Paragraph A:</span>
                                                    <select style={{ flex: 1, padding: '6px', border: '1.5px solid var(--color-border)', borderRadius: 6, background: '#fff', fontSize: '0.75rem', outline: 'none' }} defaultValue="ii">
                                                        <option value="i">i. Alternative theories</option>
                                                        <option value="ii">ii. Key introductory concept</option>
                                                        <option value="iii">iii. Future applications</option>
                                                    </select>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.75rem' }}>
                                                    <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)', minWidth: 90 }}>2. Paragraph B:</span>
                                                    <select style={{ flex: 1, padding: '6px', border: '1.5px solid var(--color-border)', borderRadius: 6, background: '#fff', fontSize: '0.75rem', outline: 'none' }} defaultValue="i">
                                                        <option value="i">i. Detailed review studies</option>
                                                        <option value="ii">ii. Environmental elements</option>
                                                        <option value="iii">iii. Theoretical conflicts</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div>
                                            <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 8 }}>
                                                Questions 1 - 3 (Listening Audio): Điền vào chỗ trống:
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                                                <div>
                                                    1. The speaker describes the marine area as <input type="text" defaultValue="extremely diverse" style={{ width: 120, padding: '3px 6px', border: '1.5px solid var(--color-border)', borderRadius: 6, outline: 'none' }} />.
                                                </div>
                                                <div>
                                                    2. Most corals grow healthily at stable <input type="text" defaultValue="temperatures" style={{ width: 100, padding: '3px 6px', border: '1.5px solid var(--color-border)', borderRadius: 6, outline: 'none' }} />.
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Simulator Footer Toolbar */}
                        <div style={{
                            background: '#f1f5f9',
                            borderTop: '1.5px solid var(--color-border)',
                            padding: '16px 20px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                                Kỹ năng hiện tại: <strong style={{ color: 'var(--color-primary)' }}>{activeTab === 'reading' ? `IELTS Reading (Passage ${activePassage}/3)` : 'IELTS Listening (Full Audio)'}</strong>
                            </span>
                            
                            <button style={{
                                padding: '10px 24px',
                                background: 'var(--color-success)',
                                color: '#fff',
                                border: 'none',
                                borderRadius: 10,
                                fontSize: '0.8125rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                boxShadow: '0 2px 6px rgba(22, 163, 74, 0.2)'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = '#15803d' }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-success)' }}
                            >
                                Submit Test (Nộp bài) ➡️
                            </button>
                        </div>

                    </div>
                </FadeIn>
            </div>
        </section>
    )
}
