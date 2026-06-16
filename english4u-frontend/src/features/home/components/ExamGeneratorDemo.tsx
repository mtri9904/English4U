import { useState, useEffect } from 'react'
import { Badge } from '@/shared/ui/Badge'
import { ProgressBar } from '@/shared/ui/ProgressBar'
import { FadeIn } from './FeaturesSection'

type Tab = 'upload' | 'topic' | 'random'
type Step = 1 | 2 | 3

export function ExamGeneratorDemo() {
    const [tab, setTab] = useState<Tab>('upload')
    const [step, setStep] = useState<Step>(1)
    const [progress, setProgress] = useState(0)
    const [logIndex, setLogIndex] = useState(0)
    const [topicInput, setTopicInput] = useState('')
    const [selectedSkill, setSelectedSkill] = useState('Reading')
    const [selectedDifficulty, setSelectedDifficulty] = useState('Medium')

    const logs = [
        '📂 [OCR Parser] Đang trích xuất nội dung từ tài liệu PDF khoa học...',
        '📝 [Metrics Estimator] Đang tính toán chỉ số Flesch-Kincaid & Gunning Fog...',
        '🤖 [QA Generator] Khởi chạy Gemma-2b sinh câu hỏi IELTS Reading và giải thích đáp án...',
        '🔍 [Validator Agent] Đang khởi chạy Agent giải đề độc lập đối chứng độ chính xác...',
        '✨ [Quality Control] Đề thi được duyệt thành công với độ chính xác >90%!'
    ]

    useEffect(() => {
        let timer: any
        let logTimer: any
        if (step === 2) {
            setProgress(0)
            setLogIndex(0)
            
            // Progress Bar timer
            timer = setInterval(() => {
                setProgress((prev) => {
                    if (prev >= 100) {
                        clearInterval(timer)
                        setStep(3)
                        return 100
                    }
                    return prev + 5
                })
            }, 150)

            // Log text rotation timer
            let idx = 0
            logTimer = setInterval(() => {
                idx++
                if (idx < logs.length) {
                    setLogIndex(idx)
                }
            }, 600)
        }
        return () => {
            clearInterval(timer)
            clearInterval(logTimer)
        }
    }, [step])

    const startGeneration = () => {
        setStep(2)
    }

    const resetDemo = () => {
        setStep(1)
        setProgress(0)
        setLogIndex(0)
    }

    return (
        <section id="ai-generator" style={{ padding: '100px 24px', position: 'relative', background: '#ffffff' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, var(--color-border-strong), transparent)' }} />
            <div className="container-app">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 48, alignItems: 'center' }}>
                    
                    {/* Left Column: Description */}
                    <FadeIn>
                        <div>
                            <span style={{ 
                                display: 'inline-block',
                                padding: '6px 16px',
                                background: 'rgba(8, 145, 178, 0.08)',
                                color: 'var(--color-primary)',
                                borderRadius: 'var(--radius-full)',
                                fontSize: '0.8125rem',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                marginBottom: 16
                            }}>
                                🤖 AI Exam Generator
                            </span>
                            <h2 style={{ 
                                fontFamily: 'var(--font-sans)', 
                                fontSize: 'clamp(2rem, 3.5vw, 2.75rem)', 
                                fontWeight: 800, 
                                marginBottom: 20, 
                                color: 'var(--color-text-primary)',
                                lineHeight: 1.2
                            }}>
                                Sinh đề thi IELTS <span style={{ color: 'var(--color-primary)' }}>tự động</span> từ mọi tài liệu của bạn
                            </h2>
                            <p style={{ fontSize: '1.0625rem', color: 'var(--color-text-secondary)', lineHeight: 1.7, marginBottom: 28 }}>
                                Không chỉ dừng lại ở các đề thi cũ, hệ thống tích hợp <strong>AI QA Pipeline</strong> chuyên sâu, cho phép bạn tự thiết lập đề thi IELTS theo 3 chế độ linh hoạt. Đặc biệt, nội dung tạo ra được chạy qua <strong>Validator Agent</strong> độc lập để kiểm định chất lượng, cam kết đáp án chính xác 100%.
                            </p>
                            
                            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 16, padding: 0 }}>
                                {[
                                    { text: '3 chế độ sinh đề: Tải tệp PDF/Word tài liệu thô, nhập chủ đề, hoặc sinh ngẫu nhiên.', label: '✓' },
                                    { text: 'Kiểm định tự động: Chạy Validator Agent giải lại đề để đo lường độ chính xác (Accuracy %).', label: '✓' },
                                    { text: 'Đánh giá độ khó: Đo độ khó đọc của bài đọc bằng chỉ số Flesch-Kincaid, Gunning Fog & AWL.', label: '✓' }
                                ].map((item, idx) => (
                                    <li key={idx} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                                        <span style={{ 
                                            width: 24, 
                                            height: 24, 
                                            borderRadius: '50%', 
                                            background: 'rgba(8, 145, 178, 0.08)', 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'center', 
                                            color: 'var(--color-primary)', 
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

                    {/* Right Column: Steps Widget */}
                    <FadeIn delay={150}>
                        <div style={{
                            background: '#ffffff',
                            border: '1.5px solid var(--color-border)',
                            borderRadius: 24,
                            padding: '28px 24px',
                            boxShadow: '0 20px 48px rgba(8, 145, 178, 0.06)',
                            position: 'relative',
                            overflow: 'hidden',
                            minHeight: 450,
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between'
                        }}>
                            {/* Widget Header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                <Badge variant="neutral">AI QA Generator Pipeline</Badge>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    {[1, 2, 3].map((s) => (
                                        <div key={s} style={{ 
                                            width: 8, 
                                            height: 8, 
                                            borderRadius: '50%', 
                                            background: step === s ? 'var(--color-primary)' : 'var(--color-border-strong)',
                                            transition: 'background 0.3s'
                                        }} />
                                    ))}
                                </div>
                            </div>

                            {/* Step Content */}
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                
                                {step === 1 && (
                                    <div style={{ animation: 'fadeIn 0.3s' }}>
                                        {/* Tabs Selector */}
                                        <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', marginBottom: 20 }}>
                                            {[
                                                { id: 'upload', label: '📄 PDF/Word' },
                                                { id: 'topic', label: '💬 Nhập chủ đề' },
                                                { id: 'random', label: '🎲 Ngẫu nhiên' }
                                            ].map((t) => (
                                                <button
                                                    key={t.id}
                                                    onClick={() => setTab(t.id as Tab)}
                                                    style={{
                                                        flex: 1,
                                                        padding: '10px 0',
                                                        background: 'transparent',
                                                        border: 'none',
                                                        borderBottom: tab === t.id ? '2px solid var(--color-primary)' : '2px solid transparent',
                                                        color: tab === t.id ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                                                        fontSize: '0.8125rem',
                                                        fontWeight: 700,
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s'
                                                    }}
                                                >
                                                    {t.label}
                                                </button>
                                            ))}
                                        </div>

                                        {/* Tab Content */}
                                        {tab === 'upload' && (
                                            <div style={{ textAlign: 'center' }}>
                                                <div 
                                                    style={{ 
                                                        border: '2px dashed var(--color-border-strong)', 
                                                        borderRadius: 16, 
                                                        padding: '30px 20px', 
                                                        cursor: 'pointer',
                                                        background: '#f8fafc',
                                                        transition: 'border-color 0.2s'
                                                    }}
                                                    onClick={startGeneration}
                                                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-primary)' }}
                                                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-strong)' }}
                                                >
                                                    <div style={{ fontSize: 40, marginBottom: 8 }}>📁</div>
                                                    <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 4 }}>
                                                        Tải lên tài liệu khoa học thô
                                                    </h3>
                                                    <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: 16 }}>
                                                        Hỗ trợ PDF, DOCX, TXT. Dung lượng tối đa 10 MB
                                                    </p>
                                                    <button style={{
                                                        padding: '8px 20px',
                                                        background: 'var(--color-primary)',
                                                        color: '#fff',
                                                        border: 'none',
                                                        borderRadius: 8,
                                                        fontSize: '0.8125rem',
                                                        fontWeight: 700,
                                                        cursor: 'pointer',
                                                        boxShadow: '0 4px 12px rgba(19, 125, 197, 0.2)'
                                                    }}>
                                                        Chọn file: climate_science.pdf 🚀
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {tab === 'topic' && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                                <div>
                                                    <label style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontWeight: 700, display: 'block', marginBottom: 6 }}>
                                                        MÔ TẢ CHI TIẾT CHỦ ĐỀ MUỐN THI:
                                                    </label>
                                                    <input 
                                                        type="text" 
                                                        placeholder="Ví dụ: Artificial intelligence impacts on medical diagnosis..." 
                                                        value={topicInput}
                                                        onChange={(e) => setTopicInput(e.target.value)}
                                                        style={{
                                                            width: '100%',
                                                            padding: '12px 14px',
                                                            borderRadius: 10,
                                                            border: '1.5px solid var(--color-border)',
                                                            fontSize: '0.875rem',
                                                            outline: 'none',
                                                            fontFamily: 'inherit'
                                                        }}
                                                    />
                                                </div>
                                                <button 
                                                    onClick={startGeneration}
                                                    style={{
                                                        padding: '12px',
                                                        background: 'var(--color-primary)',
                                                        color: '#fff',
                                                        border: 'none',
                                                        borderRadius: 10,
                                                        fontSize: '0.875rem',
                                                        fontWeight: 700,
                                                        cursor: 'pointer',
                                                        boxShadow: '0 4px 12px rgba(19, 125, 197, 0.2)',
                                                        textAlign: 'center'
                                                    }}
                                                >
                                                    ✨ Khởi chạy AI sinh đề thi
                                                </button>
                                            </div>
                                        )}

                                        {tab === 'random' && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                                    <div>
                                                        <label style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontWeight: 700, display: 'block', marginBottom: 6 }}>KỸ NĂNG:</label>
                                                        <select 
                                                            value={selectedSkill}
                                                            onChange={(e) => setSelectedSkill(e.target.value)}
                                                            style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1.5px solid var(--color-border)', outline: 'none', fontSize: '0.8125rem' }}
                                                        >
                                                            <option>Reading</option>
                                                            <option>Listening</option>
                                                            <option>Writing</option>
                                                            <option>Speaking</option>
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontWeight: 700, display: 'block', marginBottom: 6 }}>ĐỘ KHÓ:</label>
                                                        <select 
                                                            value={selectedDifficulty}
                                                            onChange={(e) => setSelectedDifficulty(e.target.value)}
                                                            style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1.5px solid var(--color-border)', outline: 'none', fontSize: '0.8125rem' }}
                                                        >
                                                            <option>Easy</option>
                                                            <option>Medium</option>
                                                            <option>Hard</option>
                                                        </select>
                                                    </div>
                                                </div>
                                                <button 
                                                    onClick={startGeneration}
                                                    style={{
                                                        padding: '12px',
                                                        background: 'var(--color-primary)',
                                                        color: '#fff',
                                                        border: 'none',
                                                        borderRadius: 10,
                                                        fontSize: '0.875rem',
                                                        fontWeight: 700,
                                                        cursor: 'pointer',
                                                        boxShadow: '0 4px 12px rgba(19, 125, 197, 0.2)',
                                                        textAlign: 'center'
                                                    }}
                                                >
                                                    🎲 Sinh đề ngẫu nhiên ngay
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {step === 2 && (
                                    <div style={{ textAlign: 'center', padding: '20px 10px', animation: 'fadeIn 0.3s' }}>
                                        <div style={{ position: 'relative', display: 'inline-block', marginBottom: 20 }}>
                                            <div style={{ fontSize: 50 }}>📄</div>
                                            <div style={{ 
                                                position: 'absolute', 
                                                top: 0, 
                                                left: 0, 
                                                right: 0, 
                                                height: 4, 
                                                background: 'rgba(8, 145, 178, 0.8)', 
                                                boxShadow: '0 0 10px rgba(8, 145, 178, 0.9)',
                                                animation: 'scanLine 1.5s ease-in-out infinite' 
                                            }} />
                                        </div>
                                        <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 4 }}>
                                            Đang chạy AI QA Pipeline...
                                        </h3>
                                        <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', minHeight: 40, margin: '0 0 16px' }}>
                                            {logs[logIndex]}
                                        </p>
                                        <div style={{ maxWidth: 280, margin: '0 auto' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: 6, fontWeight: 700 }}>
                                                <span>TIẾN TRÌNH PIPELINE</span>
                                                <span>{progress}%</span>
                                            </div>
                                            <ProgressBar value={progress} variant="primary" size="sm" />
                                        </div>
                                    </div>
                                )}

                                {step === 3 && (
                                    <div style={{ animation: 'fadeIn 0.4s' }}>
                                        {/* Status banner */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(34, 197, 94, 0.06)', border: '1px solid rgba(34, 197, 94, 0.18)', borderRadius: 12, padding: '10px 14px', marginBottom: 14 }}>
                                            <span style={{ fontSize: 18 }}>🎉</span>
                                            <div>
                                                <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-success)' }}>Sinh đề thành công!</div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>Đã trích xuất & cấu trúc hóa bộ đề Reading.</div>
                                            </div>
                                        </div>

                                        {/* AI QA Pipeline Report Card */}
                                        <div style={{ 
                                            background: '#f8fafc', 
                                            border: '1.5px solid var(--color-border)', 
                                            borderRadius: 14, 
                                            padding: 14, 
                                            marginBottom: 14 
                                        }}>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontWeight: 700, display: 'block', marginBottom: 10 }}>
                                                📊 BÁO CÁO KIỂM ĐỊNH AI QA PIPELINE:
                                            </span>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                                {/* Left section: Validator Agent accuracy */}
                                                <div style={{ background: '#ffffff', border: '1px solid var(--color-border)', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                                    <span style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', fontWeight: 700, textAlign: 'center' }}>VALIDATOR AGENT</span>
                                                    <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-primary)', marginTop: 4 }}>94.2%</span>
                                                    <span style={{ fontSize: '0.625rem', color: '#16a34a', fontWeight: 600, marginTop: 2 }}>✓ Độ chính xác cao</span>
                                                </div>
                                                {/* Right section: Readability stats */}
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'center', fontSize: '0.7125rem', color: 'var(--color-text-secondary)' }}>
                                                    <div>• FK Grade: <strong>11.8 (Khó)</strong></div>
                                                    <div>• Gunning Fog: <strong>13.4</strong></div>
                                                    <div>• Word Count: <strong>874 từ</strong></div>
                                                    <div>• AWL Ratio: <strong>8.4% (Cao)</strong></div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Passage Preview */}
                                        <div style={{ background: '#ffffff', border: '1px solid var(--color-border)', borderRadius: 12, padding: 12, marginBottom: 16 }}>
                                            <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', fontWeight: 700, display: 'block', marginBottom: 4 }}>CÂU HỎI GENERATED PREVIEW:</span>
                                            <div style={{ fontSize: '0.78rem', color: 'var(--color-text-primary)', lineHeight: 1.4 }}>
                                                <p style={{ fontStyle: 'italic', margin: '0 0 6px', color: 'var(--color-text-secondary)' }}>
                                                    "...Rising ocean temperatures lead to coral reef degradation by prompting bleaching..."
                                                </p>
                                                <strong>Q1. Elevated temperatures are the main catalyst for coral bleaching events.</strong>
                                                <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                                                    {['TRUE', 'FALSE', 'NOT GIVEN'].map((v, i) => (
                                                        <label key={i} style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: '0.7rem', cursor: 'pointer' }}>
                                                            <input type="radio" name="preview-q" defaultChecked={i === 0} style={{ accentColor: 'var(--color-primary)' }} />
                                                            {v}
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Buttons */}
                                        <div style={{ display: 'flex', gap: 10 }}>
                                            <button style={{
                                                flex: 2,
                                                padding: '10px',
                                                background: 'var(--color-primary)',
                                                color: '#fff',
                                                border: 'none',
                                                borderRadius: 10,
                                                fontWeight: 700,
                                                fontSize: '0.8125rem',
                                                cursor: 'pointer',
                                                boxShadow: '0 4px 12px rgba(19, 125, 197, 0.2)',
                                                textAlign: 'center'
                                            }}>
                                                Vào phòng thi thử ngay 🚀
                                            </button>
                                            <button 
                                                onClick={resetDemo}
                                                style={{
                                                    flex: 1,
                                                    padding: '10px',
                                                    background: 'transparent',
                                                    border: '1.5px solid var(--color-border-strong)',
                                                    borderRadius: 10,
                                                    color: 'var(--color-text-secondary)',
                                                    fontWeight: 700,
                                                    fontSize: '0.8125rem',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                Tạo đề khác 🔄
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </FadeIn>
                </div>
            </div>

            <style>{`
                @keyframes scanLine {
                    0% { top: 0%; opacity: 0; }
                    10% { opacity: 1; }
                    90% { opacity: 1; }
                    100% { top: 100%; opacity: 0; }
                }
            `}</style>
        </section>
    )
}
