import React from 'react';
import { Card, Button, Typography } from 'antd';
import { AudioOutlined, SoundOutlined } from '@ant-design/icons';
import type { FlashcardItemDto } from '../../types/flashcard.types';

const { Title, Text } = Typography;

interface FlashcardPronounceModeProps {
    currentCard: FlashcardItemDto;
    isListeningSpeech: boolean;
    spokenResult: { text: string; isCorrect: boolean } | null;
    onStartSpeech: () => void;
    onPlayAudio: (text: string) => void;
    onNextCard: () => void;
}

export const FlashcardPronounceMode: React.FC<FlashcardPronounceModeProps> = ({
    currentCard,
    isListeningSpeech,
    spokenResult,
    onStartSpeech,
    onPlayAudio,
    onNextCard,
}) => {
    return (
        <Card
            style={{
                borderRadius: 24,
                padding: '36px 24px',
                textAlign: 'center',
                boxShadow: '0 12px 36px rgba(0,0,0,0.05)',
            }}
        >
            <Title level={1} style={{ color: '#0f172a', fontWeight: 800, margin: '0 0 8px' }}>
                {currentCard.word}
            </Title>
            <Text
                style={{
                    fontSize: '1.25rem',
                    color: '#2563eb',
                    fontStyle: 'italic',
                    display: 'block',
                    marginBottom: 16,
                }}
            >
                {currentCard.phonetic}
            </Text>

            <Button
                shape="round"
                icon={<SoundOutlined />}
                onClick={() => onPlayAudio(currentCard.word)}
                style={{ marginBottom: 32 }}
            >
                Nghe giọng mẫu
            </Button>

            <div style={{ margin: '20px 0' }}>
                <Button
                    type="primary"
                    shape="circle"
                    size="large"
                    icon={<AudioOutlined />}
                    loading={isListeningSpeech}
                    onClick={onStartSpeech}
                    style={{
                        width: 90,
                        height: 90,
                        fontSize: 36,
                        background: isListeningSpeech ? '#ef4444' : '#2563eb',
                        borderColor: isListeningSpeech ? '#ef4444' : '#2563eb',
                        boxShadow: isListeningSpeech
                            ? '0 0 24px rgba(239,68,68,0.5)'
                            : '0 8px 24px rgba(37,99,235,0.3)',
                    }}
                />
                <div style={{ marginTop: 12, color: isListeningSpeech ? '#dc2626' : '#64748b', fontWeight: 600 }}>
                    {isListeningSpeech ? 'Đang lắng nghe bạn đọc...' : 'Bấm vào Micro và đọc to từ này'}
                </div>
            </div>

            {spokenResult && (
                <div
                    style={{
                        maxWidth: 450,
                        margin: '24px auto 0',
                        padding: 16,
                        borderRadius: 16,
                        background: spokenResult.isCorrect ? '#f0fdf4' : '#fff7ed',
                        border: `1px solid ${spokenResult.isCorrect ? '#86efac' : '#fdba74'}`,
                    }}
                >
                    <div
                        style={{
                            fontSize: '1.1rem',
                            fontWeight: 700,
                            color: spokenResult.isCorrect ? '#16a34a' : '#ea580c',
                            marginBottom: 6,
                        }}
                    >
                        {spokenResult.isCorrect ? '🎉 Phát âm chính xác!' : 'Chưa khớp lắm, hãy thử lại!'}
                    </div>
                    <div style={{ color: '#475569', fontSize: '0.9rem' }}>
                        Bạn đã đọc: <strong>"{spokenResult.text}"</strong>
                    </div>

                    <Button
                        type="primary"
                        style={{ marginTop: 12 }}
                        onClick={onNextCard}
                    >
                        Từ tiếp theo →
                    </Button>
                </div>
            )}
        </Card>
    );
};

