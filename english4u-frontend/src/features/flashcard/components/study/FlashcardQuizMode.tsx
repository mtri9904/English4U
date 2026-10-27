import React from 'react';
import { Card, Button, Typography } from 'antd';
import type { FlashcardItemDto } from '../../types/flashcard.types';

const { Title, Text, Paragraph } = Typography;

interface FlashcardQuizModeProps {
    currentCard: FlashcardItemDto;
    quizOptions: string[];
    selectedQuizAnswer: string | null;
    isQuizAnswered: boolean;
    onSelectAnswer: (opt: string) => void;
    onNextCard: () => void;
}

export const FlashcardQuizMode: React.FC<FlashcardQuizModeProps> = ({
    currentCard,
    quizOptions,
    selectedQuizAnswer,
    isQuizAnswered,
    onSelectAnswer,
    onNextCard,
}) => {
    return (
        <Card
            style={{
                borderRadius: 24,
                padding: '28px 24px',
                textAlign: 'center',
                boxShadow: '0 12px 36px rgba(0,0,0,0.05)',
            }}
        >
            {currentCard.imageUrl && (
                <img
                    src={currentCard.imageUrl}
                    alt={currentCard.word}
                    style={{
                        width: '100%',
                        maxWidth: 460,
                        height: 210,
                        borderRadius: 16,
                        objectFit: 'cover',
                        margin: '0 auto 18px',
                        display: 'block',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                    }}
                />
            )}

            <Title level={2} style={{ color: '#0f172a', fontWeight: 800, margin: '0 0 6px' }}>
                {currentCard.word}
            </Title>
            <Text style={{ color: '#64748b', fontStyle: 'italic', display: 'block', marginBottom: 24 }}>
                {currentCard.phonetic}
            </Text>

            <Paragraph style={{ color: '#334155', fontWeight: 600, marginBottom: 20 }}>
                Chọn nghĩa tiếng Việt chính xác nhất:
            </Paragraph>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 620, margin: '0 auto', width: '100%' }}>
                {quizOptions.map((opt, i) => {
                    let btnStyle: React.CSSProperties = {
                        minHeight: 52,
                        height: 'auto',
                        padding: '12px 20px',
                        borderRadius: 14,
                        fontWeight: 600,
                        fontSize: '0.95rem',
                        whiteSpace: 'normal',
                        wordBreak: 'break-word',
                        lineHeight: 1.5,
                        textAlign: 'center',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        border: '1.5px solid #cbd5e1',
                        background: '#ffffff',
                        color: '#1e293b',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                        transition: 'all 0.2s ease',
                    };

                    if (isQuizAnswered) {
                        if (opt === currentCard.meaningVi) {
                            btnStyle = {
                                ...btnStyle,
                                borderColor: '#16a34a',
                                color: '#16a34a',
                                background: '#f0fdf4',
                                fontWeight: 700,
                            };
                        } else if (opt === selectedQuizAnswer) {
                            btnStyle = {
                                ...btnStyle,
                                borderColor: '#ef4444',
                                color: '#dc2626',
                                background: '#fef2f2',
                                fontWeight: 700,
                            };
                        }
                    }

                    return (
                        <Button
                            key={i}
                            style={btnStyle}
                            type="default"
                            onClick={() => onSelectAnswer(opt)}
                            disabled={isQuizAnswered}
                        >
                            <span>{opt}</span>
                        </Button>
                    );
                })}
            </div>

            {isQuizAnswered && (
                <Button
                    type="primary"
                    size="large"
                    onClick={onNextCard}
                    style={{ marginTop: 24, borderRadius: 12 }}
                >
                    Câu hỏi tiếp theo →
                </Button>
            )}
        </Card>
    );
};

