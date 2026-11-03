import React from 'react';
import { Tag, Button, Spin } from 'antd';
import { SoundOutlined, ThunderboltOutlined } from '@ant-design/icons';
import type { ActiveWordLookup } from '../../hooks/useNewsWordLookup';

interface NewsWordLookupPopoverProps {
    lookup: ActiveWordLookup;
    popoverRef: React.RefObject<HTMLDivElement>;
    onClose: () => void;
    onPlayAudio: (word: string, audioUrl?: string) => void;
    onOpenFlashcard: (word: string, context: string) => void;
}

export const NewsWordLookupPopover: React.FC<NewsWordLookupPopoverProps> = ({
    lookup,
    popoverRef,
    onClose,
    onPlayAudio,
    onOpenFlashcard,
}) => {
    return (
        <div
            ref={popoverRef}
            style={{
                position: 'fixed',
                left: lookup.x,
                top: lookup.y,
                zIndex: 99999,
                width: '330px',
                background: '#ffffff',
                borderRadius: '16px',
                padding: '16px',
                boxShadow: '0 16px 36px -6px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(15, 23, 42, 0.08)',
            }}
        >
            {/* Word Title, IPA & Audio */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                        {lookup.word}
                    </span>
                    {lookup.phonetic && (
                        <span style={{ fontSize: '13px', color: '#64748b', fontFamily: 'monospace' }}>
                            {lookup.phonetic}
                        </span>
                    )}
                    {lookup.partOfSpeech && (
                        <Tag color="blue" style={{ margin: 0, fontSize: '11px', borderRadius: '4px' }}>
                            {lookup.partOfSpeech}
                        </Tag>
                    )}
                    <button
                        type="button"
                        onClick={() => onPlayAudio(lookup.word, lookup.audioUrl)}
                        style={{
                            border: 'none',
                            background: '#eff6ff',
                            color: '#2563eb',
                            borderRadius: '50%',
                            width: '26px',
                            height: '26px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                        }}
                        title="Nghe phát âm chuẩn"
                    >
                        <SoundOutlined style={{ fontSize: '13px' }} />
                    </button>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8', fontSize: '14px' }}
                >
                    ✕
                </button>
            </div>

            {/* Vietnamese Meaning & Academic Definition */}
            <div style={{ marginBottom: '10px', fontSize: '14px', color: '#334155', minHeight: '22px' }}>
                {lookup.isLoading ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '12px' }}>
                        <Spin size="small" />
                        <span>Đang tra cứu từ điển học thuật...</span>
                    </div>
                ) : (
                    <div>
                        {lookup.meaningVi && (
                            <div style={{ fontWeight: 700, color: '#0369a1', marginBottom: '4px' }}>
                                📖 {lookup.meaningVi}
                            </div>
                        )}
                        {lookup.definitionEn && (
                            <div style={{ fontSize: '12px', color: '#475569', lineHeight: 1.45, fontStyle: 'italic' }}>
                                💡 {lookup.definitionEn}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Context sentence */}
            {lookup.context && (
                <div
                    style={{
                        fontSize: '12px',
                        color: '#64748b',
                        fontStyle: 'italic',
                        marginBottom: '12px',
                        paddingLeft: '8px',
                        borderLeft: '2px solid #cbd5e1',
                        lineHeight: 1.5,
                    }}
                >
                    "{lookup.context.slice(0, 90)}..."
                </div>
            )}

            {/* Action Button: Thêm nhanh vào Flashcard */}
            <Button
                type="primary"
                icon={<ThunderboltOutlined />}
                onClick={() => onOpenFlashcard(lookup.word, lookup.context)}
                style={{
                    width: '100%',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)',
                    borderColor: 'transparent',
                    fontWeight: 700,
                    height: '36px',
                }}
            >
                ⚡ Thêm nhanh vào Flashcard
            </Button>
        </div>
    );
};

