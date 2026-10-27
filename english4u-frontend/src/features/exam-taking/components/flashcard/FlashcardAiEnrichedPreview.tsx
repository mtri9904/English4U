import React from 'react';
import { Button, Card, Image, Input, Spin, Tag, Typography } from 'antd';
import { LoadingOutlined, PlusOutlined, ReloadOutlined, SoundOutlined } from '@ant-design/icons';
import type { AiEnrichWordResponse } from '@/features/flashcard/types/flashcard.types';

const { Text } = Typography;

interface FlashcardAiEnrichedPreviewProps {
    enrichedResult: AiEnrichWordResponse;
    currentImageIndex: number;
    isChangingImage: boolean;
    isSaving: boolean;
    onCycleNextImage: () => void;
    onUpdateMeaningVi: (val: string) => void;
    onPlayAudio: (word: string, audioUrl?: string) => void;
    onCancel: () => void;
    onSave: () => void;
}

export const FlashcardAiEnrichedPreview: React.FC<FlashcardAiEnrichedPreviewProps> = ({
    enrichedResult,
    currentImageIndex,
    isChangingImage,
    isSaving,
    onCycleNextImage,
    onUpdateMeaningVi,
    onPlayAudio,
    onCancel,
    onSave,
}) => {
    return (
        <Card
            style={{
                marginTop: 16,
                borderRadius: 16,
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                overflow: 'hidden',
            }}
        >
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                {enrichedResult.imageUrl && (
                    <div
                        style={{
                            position: 'relative',
                            width: 140,
                            height: 110,
                            borderRadius: 12,
                            overflow: 'hidden',
                            flexShrink: 0,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                            border: '1px solid #e2e8f0',
                        }}
                    >
                        <Image
                            key={`${enrichedResult.imageUrl}-${currentImageIndex}`}
                            src={enrichedResult.imageUrl}
                            alt={enrichedResult.word}
                            preview={false}
                            width={140}
                            height={110}
                            wrapperStyle={{ width: 140, height: 110 }}
                            style={{ width: 140, height: 110, objectFit: 'cover' }}
                            placeholder={
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        width: 140,
                                        height: 110,
                                        background: '#f1f5f9',
                                    }}
                                >
                                    <Spin indicator={<LoadingOutlined style={{ fontSize: 20, color: '#4f46e5' }} spin />} />
                                </div>
                            }
                            fallback="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100%25' height='100%25' viewBox='0 0 100 100' fill='%23f1f5f9'><rect width='100' height='100' fill='%23f1f5f9'/><text x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='10' fill='%2394a3b8'>Ảnh lỗi</text></svg>"
                        />
                        {enrichedResult.candidateImages && enrichedResult.candidateImages.length > 1 && (
                            <Button
                                size="small"
                                type="primary"
                                icon={<ReloadOutlined />}
                                loading={isChangingImage}
                                onClick={onCycleNextImage}
                                style={{
                                    position: 'absolute',
                                    bottom: 4,
                                    right: 4,
                                    background: 'rgba(15, 23, 42, 0.85)',
                                    backdropFilter: 'blur(4px)',
                                    border: 'none',
                                    borderRadius: 6,
                                    fontWeight: 600,
                                    fontSize: '0.72rem',
                                    height: 24,
                                    padding: '0 6px',
                                    zIndex: 2,
                                }}
                            >
                                Đổi hình
                            </Button>
                        )}
                    </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                        <Text strong style={{ fontSize: '1.25rem', color: '#0f172a' }}>
                            {enrichedResult.word}
                        </Text>
                        {enrichedResult.partOfSpeech && <Tag color="blue">{enrichedResult.partOfSpeech}</Tag>}
                        <Button
                            type="text"
                            size="small"
                            icon={<SoundOutlined style={{ color: '#2563eb' }} />}
                            onClick={() => onPlayAudio(enrichedResult.word, enrichedResult.audioUrl)}
                        />
                    </div>
                    {enrichedResult.phonetic && (
                        <div style={{ color: '#64748b', fontStyle: 'italic', marginBottom: 6 }}>
                            {enrichedResult.phonetic}
                        </div>
                    )}
                    <div style={{ margin: '8px 0 10px' }}>
                        <Text strong style={{ color: '#16a34a', display: 'block', fontSize: '0.85rem', marginBottom: 2 }}>
                            👉 Nghĩa tiếng Việt (AI gợi ý theo ngữ cảnh):
                        </Text>
                        <Input
                            value={enrichedResult.meaningVi}
                            onChange={(e) => onUpdateMeaningVi(e.target.value)}
                            placeholder="Nghĩa tiếng Việt..."
                            style={{ borderRadius: 8, fontWeight: 600, color: '#15803d', borderColor: '#86efac' }}
                        />
                    </div>
                    {enrichedResult.exampleSentence && (
                        <div style={{ fontSize: '0.85rem', color: '#475569', marginBottom: 4 }}>
                            <strong>Ví dụ:</strong> {enrichedResult.exampleSentence}
                        </div>
                    )}
                    {enrichedResult.exampleSentenceVi && (
                        <div style={{ fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic', marginBottom: 4 }}>
                            <strong>Dịch:</strong> {enrichedResult.exampleSentenceVi}
                        </div>
                    )}
                    {enrichedResult.collocations && (
                        <div style={{ fontSize: '0.8rem', color: '#9333ea', marginBottom: 4 }}>
                            <strong>Collocations:</strong> {enrichedResult.collocations}
                        </div>
                    )}
                    {enrichedResult.quizDistractors && (
                        <div style={{ fontSize: '0.8rem', color: '#d97706', marginTop: 4 }}>
                            <strong>🎯 Đáp án trắc nghiệm nhiễu (Quiz):</strong>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                                {enrichedResult.quizDistractors.split('|').map((d, idx) => (
                                    <Tag key={idx} color="orange" style={{ borderRadius: 6, fontSize: '0.75rem' }}>
                                        {d.trim()}
                                    </Tag>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12 }}>
                <Button
                    size="large"
                    onClick={onCancel}
                    style={{
                        borderRadius: 10,
                        height: 42,
                        paddingInline: 22,
                        fontWeight: 600,
                        fontSize: '0.95rem',
                        color: '#475569',
                        borderColor: '#cbd5e1',
                    }}
                >
                    Hủy
                </Button>
                <Button
                    type="primary"
                    size="large"
                    icon={<PlusOutlined />}
                    loading={isSaving}
                    onClick={onSave}
                    style={{
                        borderRadius: 10,
                        height: 42,
                        paddingInline: 22,
                        fontWeight: 700,
                        fontSize: '0.95rem',
                        background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
                        border: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                    }}
                >
                    Lưu ngay vào bộ thẻ
                </Button>
            </div>
        </Card>
    );
};

