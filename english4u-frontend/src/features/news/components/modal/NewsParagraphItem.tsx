import React from 'react';
import { Spin } from 'antd';
import { cleanTranslationText } from '../../services/news.service';

interface NewsParagraphItemProps {
    blockId: number;
    text: string;
    html: string;
    isBlockquote?: boolean;
    isOpen: boolean;
    isTranslating: boolean;
    translatedText?: string;
    onToggleTranslate: (blockId: number, text: string) => void;
    onParagraphClick: (e: React.MouseEvent<HTMLElement>, text: string) => void;
}

export const NewsParagraphItem: React.FC<NewsParagraphItemProps> = ({
    blockId,
    text,
    html,
    isBlockquote,
    isOpen,
    isTranslating,
    translatedText,
    onToggleTranslate,
    onParagraphClick,
}) => {
    const handleParagraphClickInternal = (e: React.MouseEvent<HTMLElement>) => {
        const anchor = (e.target as HTMLElement).closest('a');
        if (anchor && anchor.getAttribute('href')) {
            e.preventDefault();
            e.stopPropagation();
            window.open(anchor.href, '_blank', 'noopener,noreferrer');
            return;
        }
        onParagraphClick(e, text);
    };

    return (
        <div className="guardian-paragraph-wrapper" style={{ marginBottom: '20px' }}>
            <div
                className={`guardian-interactive-p ${isBlockquote ? 'guardian-interactive-blockquote' : ''}`}
                onClick={handleParagraphClickInternal}
                dangerouslySetInnerHTML={{ __html: html }}
                style={{
                    margin: 0,
                    ...(isBlockquote
                        ? {
                              borderLeft: '4px solid #2563eb',
                              background: '#f8fbff',
                              padding: '12px 18px',
                              borderRadius: '0 10px 10px 0',
                              color: '#1e3a8a',
                              fontStyle: 'italic',
                          }
                        : {}),
                }}
                title="Click vào bất kỳ từ nào để tra từ điển & lưu Flashcard"
            />

            {/* Action Button: Dịch đoạn */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    marginTop: '6px',
                    marginBottom: '6px',
                }}
            >
                <button
                    type="button"
                    onClick={() => onToggleTranslate(blockId, text)}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '3px 10px',
                        borderRadius: '6px',
                        border: isOpen ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
                        background: isOpen ? '#eff6ff' : '#ffffff',
                        color: isOpen ? '#1d4ed8' : '#64748b',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                    }}
                >
                    {isTranslating ? (
                        <>
                            <Spin size="small" />
                            <span>Đang dịch...</span>
                        </>
                    ) : isOpen ? (
                        <span>Ẩn bản dịch</span>
                    ) : (
                        <span>🌐 Dịch đoạn</span>
                    )}
                </button>
            </div>

            {/* Translated Vietnamese Card */}
            {isOpen && translatedText && (
                <div
                    style={{
                        padding: '12px 16px',
                        background: 'linear-gradient(135deg, #f0fdf4 0%, #f8fafc 100%)',
                        borderLeft: '4px solid #10b981',
                        borderRadius: '0 10px 10px 0',
                        boxShadow: '0 2px 8px rgba(16, 185, 129, 0.08)',
                        marginTop: '4px',
                        marginBottom: '12px',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: '4px',
                        }}
                    >
                        <div
                            style={{
                                fontSize: '11px',
                                fontWeight: 700,
                                color: '#059669',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                            }}
                        >
                            <span>🇻🇳</span> BẢN DỊCH SONG NGỮ
                        </div>
                        <button
                            type="button"
                            onClick={() => onToggleTranslate(blockId, text)}
                            style={{
                                border: 'none',
                                background: 'transparent',
                                cursor: 'pointer',
                                color: '#94a3b8',
                                fontSize: '12px',
                            }}
                            title="Đóng bản dịch"
                        >
                            ✕
                        </button>
                    </div>
                    <div style={{ fontSize: '15px', lineHeight: 1.7, color: '#166534', fontWeight: 500 }}>
                        {cleanTranslationText(translatedText)}
                    </div>
                </div>
            )}
        </div>
    );
};

