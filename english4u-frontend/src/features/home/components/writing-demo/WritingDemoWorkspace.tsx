import React from 'react';
import type { DemoState } from './writingDemo.constants';

export interface WritingDemoWorkspaceProps {
    state: DemoState;
    essay: string;
    logMessage: string;
    wordCount: number;
    onEssayChange: (text: string) => void;
}

export const WritingDemoWorkspace: React.FC<WritingDemoWorkspaceProps> = ({
    state,
    essay,
    logMessage,
    wordCount,
    onEssayChange,
}) => {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', minHeight: 380, position: 'relative' }}>
            <div style={{
                padding: '20px',
                background: '#fafbfd',
                borderRight: '1px solid var(--color-border)',
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
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
                            onChange={(e) => onEssayChange(e.target.value)}
                            style={{
                                width: '100%',
                                height: '100%',
                                border: 'none',
                                outline: 'none',
                                resize: 'none',
                                fontFamily: 'inherit',
                                fontSize: 'inherit',
                                lineHeight: 'inherit',
                                color: 'inherit',
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
                                animation: 'spin 0.8s linear infinite',
                            }} />
                            <div style={{ width: '100%', maxWidth: 280 }}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--color-primary)', fontWeight: 700, textTransform: 'uppercase', textAlign: 'center', marginBottom: 6 }}>
                                    AI Engine Processing
                                </div>
                                <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', textAlign: 'center', margin: 0 }}>
                                    {logMessage}
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
                                padding: '0 2px',
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
                                    display: 'none',
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
                                padding: '0 2px',
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
                                    display: 'none',
                                }}>
                                    <div style={{ color: '#f87171', fontWeight: 700, marginBottom: 4 }}>❌ Lỗi ngữ pháp nghiêm trọng (GRA)</div>
                                    1. Lặp chủ ngữ: Tránh dùng cả "my brother" và "he".<br />
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
        </div>
    );
};

