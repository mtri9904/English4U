import React from 'react';
import type { DemoState } from './writingDemo.constants';

export interface WritingDemoScoreBarProps {
    state: DemoState;
    showCopilot: boolean;
    onCheck: () => void;
    onReset: () => void;
    onOpenCopilot: () => void;
}

export const WritingDemoScoreBar: React.FC<WritingDemoScoreBarProps> = ({
    state,
    showCopilot,
    onCheck,
    onReset,
    onOpenCopilot,
}) => {
    return (
        <div style={{
            padding: '16px 20px',
            borderTop: '1px solid var(--color-border)',
            background: '#f8fafc',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
            justifyContent: 'space-between',
            alignItems: 'center',
        }}>
            {state === 'idle' && (
                <>
                    <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                        Nhấn nút để AI bắt đầu đánh giá cấu trúc bài viết
                    </span>
                    <button
                        onClick={onCheck}
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
                            boxShadow: '0 4px 12px rgba(19, 125, 197, 0.25)',
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
                            { label: 'GRA', score: state === 'scored' ? '5.5' : '7.5' },
                        ].map((crit, idx) => (
                            <div key={idx} style={{ background: '#ffffff', border: '1px solid var(--color-border)', borderRadius: 10, padding: '8px 4px', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.625rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>{crit.label}</div>
                                <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--color-primary)', marginTop: 2 }}>{crit.score}</div>
                            </div>
                        ))}
                    </div>

                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                        <button
                            onClick={onReset}
                            style={{
                                padding: '8px 16px',
                                background: 'transparent',
                                border: '1.5px solid var(--color-border-strong)',
                                borderRadius: 10,
                                color: 'var(--color-text-secondary)',
                                fontWeight: 600,
                                fontSize: '0.8125rem',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = '#e2e8f0'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                        >
                            🔄 Reset Demo
                        </button>
                        {!showCopilot && (
                            <button
                                onClick={onOpenCopilot}
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
                                    boxShadow: '0 2px 6px rgba(19, 125, 197, 0.2)',
                                }}
                            >
                                💬 Trò chuyện AI Copilot
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

