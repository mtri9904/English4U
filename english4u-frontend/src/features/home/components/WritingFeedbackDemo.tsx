import { useState, useEffect } from 'react'
import { Badge } from '@/shared/ui/Badge'
import { FadeIn } from './FeaturesSection'

type State = 'idle' | 'checking' | 'scored' | 'corrected'

interface Message {
    sender: 'user' | 'tutor'
    text: string
}

export function WritingFeedbackDemo() {
    const [state, setState] = useState<State>('idle')
    const [essay, setEssay] = useState(
        `Learning English is very important because it helps you to get a good job. However, some people think it is too hard. Actually, I am gonna start studying every day, but sometimes my brother he do not agree with me because he thinks it takes too much time.`
    )
    const [wordCount, setWordCount] = useState(0)
    const [showCopilot, setShowCopilot] = useState(false)
    const [chatMessages, setChatMessages] = useState<Message[]>([
        {
            sender: 'tutor',
            text: 'Xin chào! Tôi là AI Writing Copilot. Tôi đã phân tích xong bài luận của bạn. Tiêu chí GRA (Ngữ pháp) của bạn đạt 5.5. Bạn có muốn tìm hiểu lý do và sửa đổi không?'
        }
    ])
    const [isTyping, setIsTyping] = useState(false)
    const [logIndex, setLogIndex] = useState(0)

    const logs = [
        '🔍 Đang phân tích cấu trúc cú pháp & ngữ nghĩa...',
        '📊 Đối chiếu với 4 tiêu chí chấm điểm IELTS Academic (TA, CC, LR, GRA)...',
        '🤖 Đang tạo phản hồi & chuẩn hóa bài viết chuẩn Band 8.0+...',
        '✨ Hoàn thành phân tích chất lượng bài viết!'
    ]

    useEffect(() => {
        const words = essay.trim().split(/\s+/).filter(w => w.length > 0)
        setWordCount(words.length)
    }, [essay])

    useEffect(() => {
        let interval: any
        if (state === 'checking') {
            setLogIndex(0)
            interval = setInterval(() => {
                setLogIndex(prev => {
                    if (prev >= logs.length - 1) {
                        clearInterval(interval)
                        setTimeout(() => {
                            setState('scored')
                            setShowCopilot(true)
                        }, 600)
                        return prev
                    }
                    return prev + 1
                })
            }, 800)
        }
        return () => clearInterval(interval)
    }, [state])

    const handleCheck = () => {
        setState('checking')
    }

    const askTutor = (question: string, reply: string) => {
        if (isTyping) return
        setChatMessages(prev => [...prev, { sender: 'user', text: question }])
        setIsTyping(true)

        setTimeout(() => {
            setIsTyping(false)
            setChatMessages(prev => [...prev, { sender: 'tutor', text: reply }])
        }, 1200)
    }

    const applyCorrections = () => {
        setState('corrected')
        setEssay(
            `Learning English is highly essential because it enables you to secure a promising career. However, some individuals believe it is excessively challenging. Actually, I am going to start studying daily, but sometimes my brother does not agree with me because he thinks it requires too much time.`
        )
        setChatMessages(prev => [
            ...prev,
            {
                sender: 'tutor',
                text: '🎉 Tuyệt vời! Tôi đã tự động áp dụng các sửa lỗi ngữ pháp (GRA) và nâng cấp từ vựng học thuật (LR) lên chuẩn Band 7.5+ vào văn bản.'
            }
        ])
    }

    const resetDemo = () => {
        setState('idle')
        setEssay(
            `Learning English is very important because it helps you to get a good job. However, some people think it is too hard. Actually, I am gonna start studying every day, but sometimes my brother he do not agree with me because he thinks it takes too much time.`
        )
        setShowCopilot(false)
        setChatMessages([
            {
                sender: 'tutor',
                text: 'Xin chào! Tôi là AI Writing Copilot. Tôi đã phân tích xong bài luận của bạn. Tiêu chí GRA (Ngữ pháp) của bạn đạt 5.5. Bạn có muốn tìm hiểu lý do và sửa đổi không?'
            }
        ])
    }

    return (
        <section id="writing-coach" style={{ padding: '100px 24px', position: 'relative', background: '#f8fafc' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, var(--color-border-strong), transparent)' }} />
            <div className="container-app">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 48, alignItems: 'center' }}>
                    <FadeIn>
                        <div>
                            <span style={{ 
                                display: 'inline-block',
                                padding: '6px 16px',
                                background: 'rgba(59, 130, 246, 0.08)',
                                color: 'var(--color-primary)',
                                borderRadius: 'var(--radius-full)',
                                fontSize: '0.8125rem',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                marginBottom: 16
                            }}>
                                ✏️ AI Writing Coach
                            </span>
                            <h2 style={{ 
                                fontSize: 'clamp(2rem, 3.5vw, 2.75rem)', 
                                fontWeight: 800, 
                                marginBottom: 20, 
                                color: 'var(--color-text-primary)',
                                lineHeight: 1.2
                            }}>
                                Chỉnh sửa bài viết <span style={{ color: 'var(--color-primary)' }}>chuẩn IELTS</span> với AI Review Copilot
                            </h2>
                            <p style={{ fontSize: '1.0625rem', color: 'var(--color-text-secondary)', lineHeight: 1.7, marginBottom: 28 }}>
                                AI Writing Coach không chỉ phát hiện lỗi chính tả thông thường mà còn chấm điểm bài viết chuẩn xác dựa trên 4 tiêu chí chấm thi IELTS Academic. Đặc biệt, bạn có thể trò chuyện trực tiếp với <strong>AI Review Copilot</strong> dưới dạng Drawer để hỏi sâu về lý do sai lệch ngữ pháp và áp dụng sửa đổi tự động chỉ với 1 click.
                            </p>
                            
                            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 16, padding: 0 }}>
                                {[
                                    { text: 'Split-screen layout: Chia đôi không gian hiển thị đề bài & khung soạn thảo chuyên nghiệp.', label: '✓' },
                                    { text: 'Chấm điểm tự động và trực quan hóa theo 4 tiêu chuẩn: TA, CC, LR, GRA.', label: '✓' },
                                    { text: 'AI Review Copilot Drawer hỗ trợ tương tác hỏi đáp về lỗi sai và gợi ý cấu trúc Band 8.0+.', label: '✓' }
                                ].map((item, idx) => (
                                    <li key={idx} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                                        <span style={{ 
                                            width: 24, 
                                            height: 24, 
                                            borderRadius: '50%', 
                                            background: 'rgba(59, 130, 246, 0.08)', 
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

                    <FadeIn delay={150}>
                        <div style={{
                            background: '#ffffff',
                            border: '1.5px solid var(--color-border)',
                            borderRadius: 24,
                            boxShadow: '0 20px 48px rgba(15, 23, 42, 0.06)',
                            position: 'relative',
                            overflow: 'hidden'
                        }}>
                            <div style={{ 
                                padding: '16px 20px', 
                                borderBottom: '1px solid var(--color-border)', 
                                display: 'flex', 
                                justifyContent: 'space-between', 
                                alignItems: 'center', 
                                background: '#f8fafc'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f56' }} />
                                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#ffbd2e' }} />
                                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#27c93f' }} />
                                    <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', fontWeight: 700, marginLeft: 8 }}>
                                        IELTS Writing Workspace
                                    </span>
                                </div>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    {state === 'scored' && <Badge variant="error" dot>Phát hiện 2 điểm trừ</Badge>}
                                    {state === 'corrected' && <Badge variant="success" dot>Đã tối ưu</Badge>}
                                    {state === 'idle' && <Badge variant="neutral">Draft</Badge>}
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', minHeight: 380, position: 'relative' }}>
                                <div style={{ 
                                    padding: '20px', 
                                    background: '#fafbfd', 
                                    borderRight: '1px solid var(--color-border)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 16
                                }}>
                                    <div>
                                        <span style={{ fontSize: '0.6875rem', background: '#eff6ff', color: 'var(--color-primary)', padding: '2px 8px', borderRadius: 4, fontWeight: 700, textTransform: 'uppercase' }}>
                                            Task 2 Question
                                        </span>
                                        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-primary)', fontWeight: 600, marginTop: 8, lineHeight: 1.5 }}>
                                            Some people think that universities should provide graduates with the knowledge and skills needed in the workplace. Others think that the true function of a university should be to give access to knowledge for its own sake...
                                        </p>
                                    </div>
                                    <div style={{ borderTop: '1px dashed var(--color-border)', paddingTop: 14 }}>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 700, display: 'block', marginBottom: 8 }}>
                                            4 TIÊU CHÍ CHẤM IELTS WRITING:
                                        </span>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>• <strong>TA/TR</strong>: Task Response</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>• <strong>CC</strong>: Coherence</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>• <strong>LR</strong>: Lexical Resource</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>• <strong>GRA</strong>: Grammatical Range</div>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative' }}>
                                    <div style={{ fontSize: '0.9375rem', lineHeight: 1.8, color: 'var(--color-text-primary)', overflowY: 'auto', flex: 1, minHeight: 200 }}>
                                        {state === 'idle' && (
                                            <textarea 
                                                value={essay}
                                                onChange={(e) => setEssay(e.target.value)}
                                                style={{
                                                    width: '100%',
                                                    height: '100%',
                                                    border: 'none',
                                                    outline: 'none',
                                                    resize: 'none',
                                                    fontFamily: 'inherit',
                                                    fontSize: 'inherit',
                                                    lineHeight: 'inherit',
                                                    color: 'inherit'
                                                }}
                                            />
                                        )}

                                        {state === 'checking' && (
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 14 }}>
                                                <div className="spinner-mini" style={{
                                                    width: 28,
                                                    height: 28,
                                                    border: '2.5px solid rgba(59, 130, 246, 0.2)',
                                                    borderTopColor: 'var(--color-primary)',
                                                    borderRadius: '50%',
                                                    animation: 'spin 0.8s linear infinite'
                                                }} />
                                                <div style={{ width: '100%', maxWidth: 280 }}>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--color-primary)', fontWeight: 700, textTransform: 'uppercase', textAlign: 'center', marginBottom: 6 }}>
                                                        AI Engine Processing
                                                    </div>
                                                    <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', textAlign: 'center', margin: 0 }}>
                                                        {logs[logIndex]}
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                        {state === 'scored' && (
                                            <p style={{ margin: 0, animation: 'fadeIn 0.3s' }}>
                                                Learning English is very important because it helps you to get a good job. However, some people think it is too hard. Actually, I am{' '}
                                                <span style={{ 
                                                    textDecoration: 'underline wavy var(--color-warning) 2px',
                                                    cursor: 'pointer',
                                                    position: 'relative',
                                                    fontWeight: 600,
                                                    background: 'rgba(245, 158, 11, 0.08)',
                                                    padding: '0 2px'
                                                }} className="writing-error-hover">
                                                    gonna
                                                    <span className="writing-tooltip" style={{
                                                        position: 'absolute',
                                                        bottom: '130%',
                                                        left: '50%',
                                                        transform: 'translateX(-50%)',
                                                        background: 'var(--color-text-primary)',
                                                        color: '#fff',
                                                        padding: '12px 14px',
                                                        borderRadius: 10,
                                                        fontSize: '0.75rem',
                                                        width: 250,
                                                        lineHeight: 1.5,
                                                        zIndex: 20,
                                                        boxShadow: 'var(--shadow-lg)',
                                                        display: 'none'
                                                    }}>
                                                        <div style={{ color: '#fbbf24', fontWeight: 700, marginBottom: 4 }}>⚠️ Từ vựng chưa trang trọng (LR)</div>
                                                        Hạn chế sử dụng contractions hoặc văn nói <strong>"gonna"</strong> trong bài thi viết IELTS Academic.
                                                        <div style={{ marginTop: 6, borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 6 }}>
                                                            👉 Đổi thành: <strong style={{ color: '#4ade80' }}>going to</strong>
                                                        </div>
                                                    </span>
                                                </span>{' '}
                                                start studying every day, but sometimes my brother{' '}
                                                <span style={{ 
                                                    textDecoration: 'underline wavy var(--color-error) 2px',
                                                    cursor: 'pointer',
                                                    position: 'relative',
                                                    fontWeight: 600,
                                                    background: 'rgba(239, 68, 68, 0.08)',
                                                    padding: '0 2px'
                                                }} className="writing-error-hover">
                                                    he do not
                                                    <span className="writing-tooltip" style={{
                                                        position: 'absolute',
                                                        bottom: '130%',
                                                        left: '50%',
                                                        transform: 'translateX(-50%)',
                                                        background: 'var(--color-text-primary)',
                                                        color: '#fff',
                                                        padding: '12px 14px',
                                                        borderRadius: 10,
                                                        fontSize: '0.75rem',
                                                        width: 260,
                                                        lineHeight: 1.5,
                                                        zIndex: 20,
                                                        boxShadow: 'var(--shadow-lg)',
                                                        display: 'none'
                                                    }}>
                                                        <div style={{ color: '#f87171', fontWeight: 700, marginBottom: 4 }}>❌ Lỗi ngữ pháp nghiêm trọng (GRA)</div>
                                                        1. Lặp chủ ngữ: Tránh dùng cả "my brother" và "he".<br/>
                                                        2. Chia sai động từ: Số ít cần đi với "does not".
                                                        <div style={{ marginTop: 6, borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 6 }}>
                                                            👉 Đổi thành: <strong style={{ color: '#4ade80' }}>does not</strong>
                                                        </div>
                                                    </span>
                                                </span>{' '}
                                                agree with me because he thinks it takes too much time.
                                            </p>
                                        )}

                                        {state === 'corrected' && (
                                            <p style={{ margin: 0, animation: 'fadeIn 0.3s' }}>
                                                Learning English is{' '}
                                                <span style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#16a34a', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                                                    highly essential
                                                </span>{' '}
                                                because it{' '}
                                                <span style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#16a34a', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                                                    enables you to secure a promising career
                                                </span>. However, some{' '}
                                                <span style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#16a34a', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                                                    individuals believe
                                                </span>{' '}
                                                it is{' '}
                                                <span style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#16a34a', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                                                    excessively challenging
                                                </span>. Actually, I am{' '}
                                                <span style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#16a34a', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                                                    going to
                                                </span>{' '}
                                                start studying{' '}
                                                <span style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#16a34a', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                                                    daily
                                                </span>, but sometimes my brother{' '}
                                                <span style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#16a34a', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                                                    does not
                                                </span>{' '}
                                                agree with me because he thinks it{' '}
                                                <span style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#16a34a', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                                                    requires
                                                </span>{' '}
                                                too much time.
                                            </p>
                                        )}
                                    </div>

                                    {state !== 'checking' && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--color-border)', paddingTop: 10, marginTop: 10, fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                                            <div>Words: <strong>{wordCount}</strong></div>
                                            {state === 'scored' && <div style={{ color: 'var(--color-warning)', fontWeight: 600 }}>⚠️ Rà soát gợi ý gạch sóng bên trên</div>}
                                            {state === 'corrected' && <div style={{ color: '#16a34a', fontWeight: 600 }}>✓ Đã cập nhật ngữ pháp nâng cao</div>}
                                            {state === 'idle' && <div>Gõ hoặc sửa bài viết trực tiếp</div>}
                                        </div>
                                    )}

                                </div>

                                {showCopilot && (
                                    <div className="copilot-drawer" style={{
                                        position: 'absolute',
                                        top: 0,
                                        right: 0,
                                        bottom: 0,
                                        width: '100%',
                                        maxWidth: '310px',
                                        background: '#ffffff',
                                        borderLeft: '1.5px solid var(--color-border)',
                                        boxShadow: '-8px 0 24px rgba(15, 23, 42, 0.08)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        zIndex: 10,
                                        animation: 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                                    }}>
                                        <div style={{ 
                                            padding: '12px 16px', 
                                            borderBottom: '1px solid var(--color-border)',
                                            background: '#f8fafc',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontSize: '1.1rem' }}>🤖</span>
                                                <div>
                                                    <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>Review Copilot</div>
                                                    <span style={{ fontSize: '0.625rem', color: '#16a34a', display: 'flex', alignItems: 'center', gap: 3 }}>
                                                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#16a34a' }} /> Online AI Tutor
                                                    </span>
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => setShowCopilot(false)}
                                                style={{ border: 'none', background: 'transparent', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)', cursor: 'pointer' }}
                                            >
                                                Đóng ✕
                                            </button>
                                        </div>

                                        <div style={{ flex: 1, padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
                                            {chatMessages.map((msg, i) => (
                                                <div 
                                                    key={i} 
                                                    style={{ 
                                                        alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                                                        background: msg.sender === 'user' ? 'var(--color-primary)' : '#f1f5f9',
                                                        color: msg.sender === 'user' ? '#ffffff' : 'var(--color-text-primary)',
                                                        padding: '10px 12px',
                                                        borderRadius: msg.sender === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                                                        fontSize: '0.8125rem',
                                                        lineHeight: 1.4,
                                                        maxWidth: '85%',
                                                        whiteSpace: 'pre-line'
                                                    }}
                                                >
                                                    {msg.text}
                                                </div>
                                            ))}
                                            {isTyping && (
                                                <div style={{ alignSelf: 'flex-start', background: '#f1f5f9', padding: '10px 14px', borderRadius: '12px 12px 12px 2px', display: 'flex', gap: 4, alignItems: 'center' }}>
                                                    <span className="dot-bounce" style={{ width: 5, height: 5, background: 'var(--color-text-muted)', borderRadius: '50%' }} />
                                                    <span className="dot-bounce" style={{ width: 5, height: 5, background: 'var(--color-text-muted)', borderRadius: '50%', animationDelay: '0.2s' }} />
                                                    <span className="dot-bounce" style={{ width: 5, height: 5, background: 'var(--color-text-muted)', borderRadius: '50%', animationDelay: '0.4s' }} />
                                                </div>
                                            )}
                                        </div>

                                        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--color-border)', background: '#fafbfd' }}>
                                            {state === 'scored' && !isTyping && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                    <button 
                                                        onClick={() => askTutor(
                                                            'Tại sao tiêu chí GRA (Ngữ pháp) của tôi bị thấp?', 
                                                            'Tiêu chí Grammatical Range and Accuracy (GRA) của bạn đạt 5.5 do:\n1. Lặp chủ ngữ ("my brother he")\n2. Sai chia động từ số ít ("he do not" thay vì "he does not").\nNgoài ra từ "gonna" là văn nói, làm giảm độ trang trọng trong IELTS Writing.'
                                                        )}
                                                        style={{ 
                                                            padding: '8px 12px', 
                                                            background: '#ffffff', 
                                                            border: '1px solid var(--color-border-strong)', 
                                                            borderRadius: 8, 
                                                            fontSize: '0.75rem', 
                                                            textAlign: 'left', 
                                                            cursor: 'pointer',
                                                            color: 'var(--color-primary)',
                                                            fontWeight: 600
                                                        }}
                                                    >
                                                        ❓ Tại sao tiêu chí GRA của tôi bị thấp?
                                                    </button>
                                                    <button 
                                                        onClick={applyCorrections}
                                                        style={{ 
                                                            padding: '8px 12px', 
                                                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', 
                                                            border: 'none', 
                                                            borderRadius: 8, 
                                                            fontSize: '0.75rem', 
                                                            fontWeight: 700,
                                                            color: '#ffffff',
                                                            cursor: 'pointer',
                                                            boxShadow: '0 2px 6px rgba(16, 185, 129, 0.2)',
                                                            textAlign: 'center'
                                                        }}
                                                    >
                                                        ✨ Áp dụng sửa đổi tự động Band 7.5+
                                                    </button>
                                                </div>
                                            )}

                                            {state === 'corrected' && (
                                                <div style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 600, textAlign: 'center', padding: '6px 0' }}>
                                                    ✓ Đã tối ưu hóa ngữ pháp thành công!
                                                </div>
                                            )}
                                        </div>

                                    </div>
                                )}

                            </div>

                            <div style={{ 
                                padding: '16px 20px', 
                                borderTop: '1px solid var(--color-border)', 
                                background: '#f8fafc',
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: 16,
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}>
                                {state === 'idle' && (
                                    <>
                                        <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                                            Nhấn nút để AI bắt đầu đánh giá cấu trúc bài viết
                                        </span>
                                        <button 
                                            onClick={handleCheck}
                                            style={{
                                                padding: '10px 20px',
                                                background: 'var(--color-primary)',
                                                color: '#fff',
                                                border: 'none',
                                                borderRadius: 10,
                                                fontWeight: 700,
                                                fontSize: '0.875rem',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s',
                                                boxShadow: '0 4px 12px rgba(19, 125, 197, 0.25)'
                                            }}
                                        >
                                            ✨ Đánh giá IELTS bằng AI
                                        </button>
                                    </>
                                )}

                                {(state === 'scored' || state === 'corrected') && (
                                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                                            <div style={{ background: '#ffffff', border: '1px solid var(--color-border)', borderRadius: 10, padding: '8px 4px', textAlign: 'center' }}>
                                                <div style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', fontWeight: 700 }}>OVERALL</div>
                                                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#16a34a', marginTop: 2 }}>
                                                    {state === 'scored' ? '6.0' : '7.5'}
                                                </div>
                                            </div>
                                            {[
                                                { label: 'TA/TR', score: state === 'scored' ? '6.5' : '7.5' },
                                                { label: 'CC', score: state === 'scored' ? '6.0' : '7.0' },
                                                { label: 'LR', score: state === 'scored' ? '6.5' : '8.0' },
                                                { label: 'GRA', score: state === 'scored' ? '5.5' : '7.5' }
                                            ].map((crit, idx) => (
                                                <div key={idx} style={{ background: '#ffffff', border: '1px solid var(--color-border)', borderRadius: 10, padding: '8px 4px', textAlign: 'center' }}>
                                                    <div style={{ fontSize: '0.625rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>{crit.label}</div>
                                                    <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--color-primary)', marginTop: 2 }}>{crit.score}</div>
                                                </div>
                                            ))}
                                        </div>

                                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                                            <button 
                                                onClick={resetDemo}
                                                style={{
                                                    padding: '8px 16px',
                                                    background: 'transparent',
                                                    border: '1.5px solid var(--color-border-strong)',
                                                    borderRadius: 10,
                                                    color: 'var(--color-text-secondary)',
                                                    fontWeight: 600,
                                                    fontSize: '0.8125rem',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s'
                                                }}
                                                onMouseEnter={(e) => { e.currentTarget.style.background = '#e2e8f0' }}
                                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                                            >
                                                🔄 Reset Demo
                                            </button>
                                            {!showCopilot && (
                                                <button 
                                                    onClick={() => setShowCopilot(true)}
                                                    style={{
                                                        padding: '8px 16px',
                                                        background: 'var(--color-primary)',
                                                        color: '#fff',
                                                        border: 'none',
                                                        borderRadius: 10,
                                                        fontWeight: 700,
                                                        fontSize: '0.8125rem',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s',
                                                        boxShadow: '0 2px 6px rgba(19, 125, 197, 0.2)'
                                                    }}
                                                >
                                                    💬 Trò chuyện AI Copilot
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                        </div>
                    </FadeIn>
                </div>
            </div>

            <style>{`
                .writing-error-hover:hover .writing-tooltip {
                    display: block !important;
                }
                @keyframes slideIn {
                    from { transform: translateX(100%); }
                    to { transform: translateX(0); }
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                .dot-bounce {
                    animation: dotBounce 1.2s infinite ease-in-out;
                }
                @keyframes dotBounce {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-4px); }
                }
            `}</style>
        </section>
    )
}
