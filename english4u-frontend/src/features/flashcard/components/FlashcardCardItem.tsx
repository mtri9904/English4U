import React from 'react';
import { Card, Tag, Button, Space, Popconfirm, Typography } from 'antd';
import {
    SoundOutlined,
    EditOutlined,
    DeleteOutlined,
    CheckCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { FlashcardItemDto } from '../types/flashcard.types';

const { Text } = Typography;

interface FlashcardCardItemProps {
    card: FlashcardItemDto;
    deckId: string;
    onEdit: (card: FlashcardItemDto) => void;
    onDelete: (cardId: string) => void;
}

export const FlashcardCardItem: React.FC<FlashcardCardItemProps> = ({
    card,
    deckId,
    onEdit,
    onDelete,
}) => {
    const navigate = useNavigate();

    const playAudio = (text: string, audioUrl?: string) => {
        if (audioUrl) {
            try {
                const audio = new Audio(audioUrl);
                audio.play().catch(() => playSpeech(text));
                return;
            } catch {
                // fallback
            }
        }
        playSpeech(text);
    };

    const playSpeech = (text: string) => {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'en-US';
            utterance.rate = 0.9;
            window.speechSynthesis.speak(utterance);
        }
    };

    return (
        <Card
            hoverable
            onClick={() => navigate(`/app/flashcards/${deckId}/study?cardId=${card.id}`)}
            style={{
                width: '100%',
                height: '100%',
                borderRadius: 16,
                border: '1.5px solid #e2e8f0',
                boxShadow: '0 4px 14px rgba(0,0,0,0.02)',
                overflow: 'hidden',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                transition: 'all 0.2s ease',
            }}
            bodyStyle={{
                padding: 18,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
            }}
        >
            <div style={{ display: 'flex', gap: 16, height: '100%', flex: 1 }}>
                {/* Visual Thumbnail */}
                {card.imageUrl ? (
                    <img
                        src={card.imageUrl}
                        alt={card.word}
                        style={{
                            width: 105,
                            height: 105,
                            borderRadius: 14,
                            objectFit: 'cover',
                            flexShrink: 0,
                            border: '1px solid #e2e8f0',
                        }}
                        loading="lazy"
                    />
                ) : (
                    <div
                        style={{
                            width: 105,
                            height: 105,
                            borderRadius: 14,
                            background: '#f1f5f9',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            color: '#94a3b8',
                            fontSize: '0.8rem',
                        }}
                    >
                        No Image
                    </div>
                )}

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            marginBottom: 2,
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Text strong style={{ fontSize: '1.2rem', color: '#0f172a' }}>
                                {card.word}
                            </Text>
                            {card.partOfSpeech && <Tag color="blue">{card.partOfSpeech}</Tag>}
                            <Button
                                type="text"
                                size="small"
                                icon={<SoundOutlined />}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    playAudio(card.word, card.audioUrl);
                                }}
                            />
                        </div>

                        <Space size="small" onClick={(e) => e.stopPropagation()}>
                            <Button
                                type="text"
                                size="small"
                                icon={<EditOutlined />}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onEdit(card);
                                }}
                            />
                            <Popconfirm
                                title="Xóa từ vựng này?"
                                onConfirm={(e) => {
                                    e?.stopPropagation();
                                    onDelete(card.id);
                                }}
                                onCancel={(e) => e?.stopPropagation()}
                                okText="Xóa"
                                cancelText="Hủy"
                                okButtonProps={{ danger: true }}
                            >
                                <Button
                                    type="text"
                                    size="small"
                                    danger
                                    icon={<DeleteOutlined />}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            </Popconfirm>
                        </Space>
                    </div>

                    {card.phonetic && (
                        <div
                            style={{
                                color: '#64748b',
                                fontSize: '0.85rem',
                                fontStyle: 'italic',
                                marginBottom: 4,
                            }}
                        >
                            {card.phonetic}
                        </div>
                    )}

                    <div
                        style={{
                            fontWeight: 600,
                            color: '#15803d',
                            fontSize: '0.95rem',
                            marginBottom: 6,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            lineHeight: 1.4,
                        }}
                        title={card.meaningVi}
                    >
                        {card.meaningVi}
                    </div>

                    {card.exampleSentence && (
                        <div
                            style={{
                                fontSize: '0.825rem',
                                color: '#475569',
                                lineHeight: 1.4,
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                                marginBottom: 8,
                            }}
                            title={card.exampleSentence}
                        >
                            <strong>Ex:</strong> {card.exampleSentence}
                        </div>
                    )}

                    {/* Status Pill & Click-to-study hint */}
                    <div
                        style={{
                            marginTop: 'auto',
                            paddingTop: 8,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                        }}
                    >
                        {card.repetitions >= 3 ? (
                            <Tag color="green" icon={<CheckCircleOutlined />}>
                                Đã thuộc tốt ({card.repetitions} lần)
                            </Tag>
                        ) : (
                            <Tag color="default">Đang ghi nhớ ({card.repetitions}/3)</Tag>
                        )}
                        <span style={{ fontSize: '0.8rem', color: '#2563eb', fontWeight: 600 }}>
                            Học từ này →
                        </span>
                    </div>
                </div>
            </div>
        </Card>
    );
};

