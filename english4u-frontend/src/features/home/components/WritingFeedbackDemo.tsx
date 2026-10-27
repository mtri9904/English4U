import { useState, useEffect } from 'react';
import { Badge } from '@/shared/ui/Badge';
import { FadeIn } from './FeaturesSection';
import { countWords } from '../utils/home.utils';
import {
    type DemoState,
    type ChatMessage,
    INITIAL_ESSAY,
    CORRECTED_ESSAY,
    ANALYSIS_LOGS,
    INITIAL_TUTOR_MESSAGE,
    writingDemoStyles,
} from './writing-demo/writingDemo.constants';
import { WritingDemoWorkspace } from './writing-demo/WritingDemoWorkspace';
import { WritingDemoCopilotDrawer } from './writing-demo/WritingDemoCopilotDrawer';
import { WritingDemoScoreBar } from './writing-demo/WritingDemoScoreBar';

export function WritingFeedbackDemo() {
    const [state, setState] = useState<DemoState>('idle');
    const [essay, setEssay] = useState(INITIAL_ESSAY);
    const [wordCount, setWordCount] = useState(0);
    const [showCopilot, setShowCopilot] = useState(false);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([INITIAL_TUTOR_MESSAGE]);
    const [isTyping, setIsTyping] = useState(false);
    const [logIndex, setLogIndex] = useState(0);

    useEffect(() => {
        setWordCount(countWords(essay));
    }, [essay]);

    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (state === 'checking') {
            setLogIndex(0);
            interval = setInterval(() => {
                setLogIndex((prev) => {
                    if (prev >= ANALYSIS_LOGS.length - 1) {
                        clearInterval(interval);
                        setTimeout(() => {
                            setState('scored');
                            setShowCopilot(true);
                        }, 600);
                        return prev;
                    }
                    return prev + 1;
                });
            }, 800);
        }
        return () => clearInterval(interval);
    }, [state]);

    const handleCheck = () => {
        setState('checking');
    };

    const askTutor = (question: string, reply: string) => {
        if (isTyping) return;
        setChatMessages((prev) => [...prev, { sender: 'user', text: question }]);
        setIsTyping(true);

        setTimeout(() => {
            setIsTyping(false);
            setChatMessages((prev) => [...prev, { sender: 'tutor', text: reply }]);
        }, 1200);
    };

    const applyCorrections = () => {
        setState('corrected');
        setEssay(CORRECTED_ESSAY);
        setChatMessages((prev) => [
            ...prev,
            {
                sender: 'tutor',
                text: '🎉 Tuyệt vời! Tôi đã tự động áp dụng các sửa lỗi ngữ pháp (GRA) và nâng cấp từ vựng học thuật (LR) lên chuẩn Band 7.5+ vào văn bản.',
            },
        ]);
    };

    const resetDemo = () => {
        setState('idle');
        setEssay(INITIAL_ESSAY);
        setShowCopilot(false);
        setChatMessages([INITIAL_TUTOR_MESSAGE]);
    };

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
                                marginBottom: 16,
                            }}>
                                ✏️ AI Writing Coach
                            </span>
                            <h2 style={{
                                fontSize: 'clamp(2rem, 3.5vw, 2.75rem)',
                                fontWeight: 800,
                                marginBottom: 20,
                                color: 'var(--color-text-primary)',
                                lineHeight: 1.2,
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
                                    { text: 'AI Review Copilot Drawer hỗ trợ tương tác hỏi đáp về lỗi sai và gợi ý cấu trúc Band 8.0+.', label: '✓' },
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
                                            flexShrink: 0,
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
                            overflow: 'hidden',
                        }}>
                            <div style={{
                                padding: '16px 20px',
                                borderBottom: '1px solid var(--color-border)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                background: '#f8fafc',
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

                            <div style={{ position: 'relative' }}>
                                <WritingDemoWorkspace
                                    state={state}
                                    essay={essay}
                                    logMessage={ANALYSIS_LOGS[logIndex]}
                                    wordCount={wordCount}
                                    onEssayChange={setEssay}
                                />

                                {showCopilot && (
                                    <WritingDemoCopilotDrawer
                                        state={state}
                                        chatMessages={chatMessages}
                                        isTyping={isTyping}
                                        onClose={() => setShowCopilot(false)}
                                        onAskTutor={askTutor}
                                        onApplyCorrections={applyCorrections}
                                    />
                                )}
                            </div>

                            <WritingDemoScoreBar
                                state={state}
                                showCopilot={showCopilot}
                                onCheck={handleCheck}
                                onReset={resetDemo}
                                onOpenCopilot={() => setShowCopilot(true)}
                            />
                        </div>
                    </FadeIn>
                </div>
            </div>

            <style>{writingDemoStyles}</style>
        </section>
    );
}
