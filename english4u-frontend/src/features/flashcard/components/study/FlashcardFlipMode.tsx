import React from 'react';
import { Button, Tag, Typography } from 'antd';
import { SoundOutlined } from '@ant-design/icons';
import type { FlashcardItemDto } from '../../types/flashcard.types';

const { Title, Text, Paragraph } = Typography;

interface FlashcardFlipModeProps {
    currentCard: FlashcardItemDto;
    isFlipped: boolean;
    onToggleFlip: () => void;
    onRate: (rating: number) => void;
    onPlayAudio: (text: string, audioUrl?: string) => void;
}

export const FlashcardFlipMode: React.FC<FlashcardFlipModeProps> = ({
    currentCard,
    isFlipped,
    onToggleFlip,
    onRate,
    onPlayAudio,
}) => {
    return (
        <div>
            {/* Flashcard Box with 3D Flip Animation */}
            <div
                onClick={onToggleFlip}
                style={{
                    perspective: 1200,
                    cursor: 'pointer',
                    minHeight: 520,
                    marginBottom: 24,
                    userSelect: 'none',
                }}
            >
                <div
                    style={{
                        position: 'relative',
                        width: '100%',
                        minHeight: 520,
                        transformStyle: 'preserve-3d',
                        transition: 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
                        transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                    }}
                >
                    {/* MẶT TRƯỚC (Front) */}
                    <div
                        style={{
                            position: 'absolute',
                            inset: 0,
                            width: '100%',
                            height: '100%',
                            backfaceVisibility: 'hidden',
                            WebkitBackfaceVisibility: 'hidden',
                            background: '#ffffff',
                            borderRadius: 24,
                            padding: '32px 28px',
                            boxShadow: '0 16px 40px rgba(15,23,42,0.08)',
                            border: '1px solid #e2e8f0',
                            textAlign: 'center',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            pointerEvents: isFlipped ? 'none' : 'auto',
                        }}
                    >
                        {currentCard.imageUrl && (
                            <img
                                src={currentCard.imageUrl}
                                alt={currentCard.word}
                                style={{
                                    width: '100%',
                                    maxWidth: 580,
                                    height: 250,
                                    borderRadius: 18,
                                    objectFit: 'cover',
                                    marginBottom: 20,
                                    boxShadow: '0 10px 28px rgba(0,0,0,0.1)',
                                    border: '1px solid #f1f5f9',
                                }}
                                loading="lazy"
                            />
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                            <Title level={1} style={{ margin: 0, fontWeight: 800, color: '#0f172a' }}>
                                {currentCard.word}
                            </Title>
                            <Button
                                type="primary"
                                shape="circle"
                                icon={<SoundOutlined />}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onPlayAudio(currentCard.word, currentCard.audioUrl);
                                }}
                                style={{ background: '#2563eb' }}
                            />
                        </div>

                        {currentCard.phonetic && (
                            <Text style={{ fontSize: '1.15rem', color: '#64748b', fontStyle: 'italic', marginBottom: 8 }}>
                                {currentCard.phonetic}
                            </Text>
                        )}

                        {currentCard.partOfSpeech && (
                            <Tag color="blue" style={{ fontSize: '0.85rem', padding: '4px 12px', borderRadius: 999 }}>
                                {currentCard.partOfSpeech}
                            </Tag>
                        )}

                        <div style={{ marginTop: 24, color: '#94a3b8', fontSize: '0.875rem' }}>
                            (Bấm vào thẻ hoặc phím Cách để lật mặt sau)
                        </div>
                    </div>

                    {/* MẶT SAU (Back) */}
                    <div
                        style={{
                            position: 'relative',
                            width: '100%',
                            minHeight: 520,
                            backfaceVisibility: 'hidden',
                            WebkitBackfaceVisibility: 'hidden',
                            transform: 'rotateY(180deg)',
                            background: '#ffffff',
                            borderRadius: 24,
                            padding: '36px 32px',
                            boxShadow: '0 16px 40px rgba(15,23,42,0.08)',
                            border: '1px solid #e2e8f0',
                            textAlign: 'center',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            pointerEvents: isFlipped ? 'auto' : 'none',
                        }}
                    >
                        <div style={{ width: '100%' }}>
                            <Tag color="green" style={{ fontSize: '0.9rem', padding: '4px 14px', borderRadius: 999, marginBottom: 16 }}>
                                Nghĩa Tiếng Việt
                            </Tag>
                            <Title level={2} style={{ color: '#15803d', fontWeight: 800, margin: '0 0 16px' }}>
                                {currentCard.meaningVi}
                            </Title>

                            {currentCard.definitionEn && (
                                <Paragraph style={{ color: '#475569', fontSize: '1rem', maxWidth: 550, margin: '0 auto 16px' }}>
                                    <em>"{currentCard.definitionEn}"</em>
                                </Paragraph>
                            )}

                            {currentCard.exampleSentence && (
                                <div
                                    style={{
                                        background: '#f8fafc',
                                        borderRadius: 14,
                                        padding: '16px 20px',
                                        maxWidth: 600,
                                        margin: '0 auto 16px',
                                        textAlign: 'left',
                                        borderLeft: '4px solid #2563eb',
                                    }}
                                >
                                    <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>
                                        💡 {currentCard.exampleSentence}
                                    </div>
                                    {currentCard.exampleSentenceVi && (
                                        <div style={{ color: '#64748b', fontSize: '0.9rem' }}>
                                            👉 {currentCard.exampleSentenceVi}
                                        </div>
                                    )}
                                </div>
                            )}

                            {currentCard.collocations && (
                                <div style={{ color: '#9333ea', fontSize: '0.9rem' }}>
                                    <strong>Collocations:</strong> {currentCard.collocations}
                                </div>
                            )}

                            <div style={{ marginTop: 24, color: '#94a3b8', fontSize: '0.825rem' }}>
                                (Bấm vào thẻ hoặc phím Cách để lật lại mặt trước)
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* SM-2 Rating Buttons (Shown when flipped) */}
            {isFlipped ? (
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: 16,
                        maxWidth: 680,
                        margin: '0 auto',
                    }}
                >
                    <Button
                        size="large"
                        onClick={() => onRate(1)}
                        style={{
                            height: 58,
                            borderRadius: 14,
                            borderColor: '#ef4444',
                            color: '#dc2626',
                            background: '#fef2f2',
                            fontWeight: 700,
                        }}
                    >
                        ❌ Khó (1)<br />
                        <span style={{ fontSize: '0.75rem', fontWeight: 400 }}>Lặp lại sau 1 ngày</span>
                    </Button>
                    <Button
                        size="large"
                        onClick={() => onRate(2)}
                        style={{
                            height: 58,
                            borderRadius: 14,
                            borderColor: '#3b82f6',
                            color: '#2563eb',
                            background: '#eff6ff',
                            fontWeight: 700,
                        }}
                    >
                        ⚡ Trung bình (2)<br />
                        <span style={{ fontSize: '0.75rem', fontWeight: 400 }}>Lặp lại sau 3 ngày</span>
                    </Button>
                    <Button
                        size="large"
                        onClick={() => onRate(3)}
                        style={{
                            height: 58,
                            borderRadius: 14,
                            borderColor: '#10b981',
                            color: '#16a34a',
                            background: '#f0fdf4',
                            fontWeight: 700,
                        }}
                    >
                        🌟 Dễ (3)<br />
                        <span style={{ fontSize: '0.75rem', fontWeight: 400 }}>Lặp lại sau 7 ngày</span>
                    </Button>
                </div>
            ) : (
                <div style={{ textAlign: 'center' }}>
                    <Button
                        type="primary"
                        size="large"
                        onClick={onToggleFlip}
                        style={{ height: 48, borderRadius: 12, fontWeight: 700, minWidth: 200 }}
                    >
                        Lật thẻ xem nghĩa (Space)
                    </Button>
                </div>
            )}
        </div>
    );
};

