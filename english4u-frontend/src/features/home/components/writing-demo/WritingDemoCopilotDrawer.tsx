import React from 'react';
import type { ChatMessage, DemoState } from './writingDemo.constants';

export interface WritingDemoCopilotDrawerProps {
    state: DemoState;
    chatMessages: ChatMessage[];
    isTyping: boolean;
    onClose: () => void;
    onAskTutor: (question: string, reply: string) => void;
    onApplyCorrections: () => void;
}

export const WritingDemoCopilotDrawer: React.FC<WritingDemoCopilotDrawerProps> = ({
    state,
    chatMessages,
    isTyping,
    onClose,
    onAskTutor,
    onApplyCorrections,
}) => {
    return (
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
            animation: 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
            <div style={{
                padding: '12px 16px',
                borderBottom: '1px solid var(--color-border)',
                background: '#f8fafc',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
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
                    onClick={onClose}
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
                            whiteSpace: 'pre-line',
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
                            onClick={() => onAskTutor(
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
                                fontWeight: 600,
                            }}
                        >
                            ❓ Tại sao tiêu chí GRA của tôi bị thấp?
                        </button>
                        <button
                            onClick={onApplyCorrections}
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
                                textAlign: 'center',
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
    );
};

