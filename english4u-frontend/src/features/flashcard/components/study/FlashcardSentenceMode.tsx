import React from 'react';
import { Card, Button, Input, Tag, Typography } from 'antd';
import {
    BulbOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    SoundOutlined,
} from '@ant-design/icons';
import type { AiCheckSentenceResponse, FlashcardItemDto } from '../../types/flashcard.types';

const { Title, Text, Paragraph } = Typography;

interface FlashcardSentenceModeProps {
    currentCard: FlashcardItemDto;
    userSentence: string;
    isCheckingSentence: boolean;
    sentenceFeedback: AiCheckSentenceResponse | null;
    onChangeSentence: (val: string) => void;
    onCheckSentence: () => void;
    onNextCard: () => void;
    onPlayAudio: (text: string) => void;
}

export const FlashcardSentenceMode: React.FC<FlashcardSentenceModeProps> = ({
    currentCard,
    userSentence,
    isCheckingSentence,
    sentenceFeedback,
    onChangeSentence,
    onCheckSentence,
    onNextCard,
    onPlayAudio,
}) => {
    return (
        <Card style={{ borderRadius: 24, padding: '24px 20px', boxShadow: '0 12px 36px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 20 }}>
                {currentCard.imageUrl && (
                    <img
                        src={currentCard.imageUrl}
                        alt={currentCard.word}
                        style={{ width: 110, height: 90, borderRadius: 14, objectFit: 'cover' }}
                    />
                )}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Title level={2} style={{ margin: 0, fontWeight: 800, color: '#0f172a' }}>
                            {currentCard.word}
                        </Title>
                        <Tag color="blue">{currentCard.partOfSpeech}</Tag>
                    </div>
                    <div style={{ color: '#15803d', fontWeight: 600, fontSize: '1rem', marginTop: 4 }}>
                        👉 {currentCard.meaningVi}
                    </div>
                </div>
            </div>

            <div style={{ marginBottom: 16 }}>
                <Text strong style={{ fontSize: '1rem', color: '#1e293b' }}>
                    ✍️ Hãy viết một câu tiếng Anh hoàn chỉnh có chứa từ <strong>"{currentCard.word}"</strong>:
                </Text>
                <Input.TextArea
                    rows={3}
                    value={userSentence}
                    onChange={(e) => onChangeSentence(e.target.value)}
                    placeholder={`Ví dụ: In modern society, ${currentCard.word}...`}
                    style={{ borderRadius: 12, marginTop: 8, fontSize: '1rem', padding: 12 }}
                    onPressEnter={(e) => {
                        if (e.ctrlKey) onCheckSentence();
                    }}
                />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Button onClick={() => onPlayAudio(currentCard.exampleSentence || currentCard.word)}>
                    Xem gợi ý câu mẫu
                </Button>
                <Button
                    type="primary"
                    size="large"
                    icon={<BulbOutlined />}
                    loading={isCheckingSentence}
                    onClick={onCheckSentence}
                    style={{ borderRadius: 12, fontWeight: 700 }}
                >
                    Chấm câu bằng AI
                </Button>
            </div>

            {/* AI Feedback Result */}
            {sentenceFeedback && (
                <div
                    style={{
                        marginTop: 24,
                        padding: 20,
                        borderRadius: 16,
                        background: sentenceFeedback.isCorrect ? '#f0fdf4' : '#fff7ed',
                        border: `1px solid ${sentenceFeedback.isCorrect ? '#86efac' : '#fdba74'}`,
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {sentenceFeedback.isCorrect ? (
                                <CheckCircleOutlined style={{ fontSize: 24, color: '#16a34a' }} />
                            ) : (
                                <CloseCircleOutlined style={{ fontSize: 24, color: '#ea580c' }} />
                            )}
                            <Text strong style={{ fontSize: '1.1rem', color: sentenceFeedback.isCorrect ? '#166534' : '#9a3412' }}>
                                {sentenceFeedback.isCorrect ? 'Sử dụng từ chính xác!' : 'Cần cải thiện ngữ pháp/ngữ cảnh'}
                            </Text>
                        </div>
                        <Tag
                            color={sentenceFeedback.score >= 8 ? 'green' : 'orange'}
                            style={{ fontSize: '0.9rem', padding: '4px 12px', borderRadius: 999, fontWeight: 700 }}
                        >
                            Điểm: {sentenceFeedback.score}/10
                        </Tag>
                    </div>

                    <Paragraph style={{ margin: '0 0 12px', color: '#334155' }}>
                        {sentenceFeedback.feedbackVi}
                    </Paragraph>

                    {sentenceFeedback.grammarErrors?.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                            <Text strong style={{ color: '#dc2626' }}>Lỗi cần chú ý:</Text>
                            <ul style={{ margin: '4px 0 0', paddingLeft: 20, color: '#b91c1c' }}>
                                {sentenceFeedback.grammarErrors.map((err, i) => (
                                    <li key={i}>{err}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {sentenceFeedback.correctedSentence && (
                        <div
                            style={{
                                background: '#ffffff',
                                borderRadius: 12,
                                padding: '14px 18px',
                                border: sentenceFeedback.isCorrect ? '1.5px solid #86efac' : '1.5px solid #38bdf8',
                                marginBottom: 16,
                                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                <Text style={{ fontSize: '0.85rem', color: '#0369a1', fontWeight: 700 }}>
                                    ✍️ {sentenceFeedback.isCorrect ? 'Câu của bạn (Đã chuẩn ngữ pháp):' : 'Câu sửa đúng chuẩn (từ câu của bạn):'}
                                </Text>
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<SoundOutlined />}
                                    onClick={() => onPlayAudio(sentenceFeedback.correctedSentence!)}
                                    style={{ color: '#0284c7' }}
                                />
                            </div>
                            <Text strong style={{ fontSize: '1rem', color: '#0f172a', display: 'block', lineHeight: 1.5 }}>
                                {sentenceFeedback.correctedSentence}
                            </Text>
                        </div>
                    )}

                    {sentenceFeedback.examplesByLevel && sentenceFeedback.examplesByLevel.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                            <Text strong style={{ fontSize: '0.9rem', color: '#334155', display: 'block', marginBottom: 10 }}>
                                📚 Các câu ví dụ theo cấp độ (Dễ → Trung bình → Khó):
                            </Text>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {sentenceFeedback.examplesByLevel.map((ex, idx) => {
                                    let badgeColor = '#16a34a';
                                    let badgeBg = '#f0fdf4';
                                    let badgeBorder = '#bbf7d0';
                                    if (ex.level.includes('Trung bình')) {
                                        badgeColor = '#2563eb';
                                        badgeBg = '#eff6ff';
                                        badgeBorder = '#bfdbfe';
                                    } else if (ex.level.includes('Khó')) {
                                        badgeColor = '#9333ea';
                                        badgeBg = '#faf5ff';
                                        badgeBorder = '#e9d5ff';
                                    }

                                    return (
                                        <div
                                            key={idx}
                                            style={{
                                                background: '#ffffff',
                                                borderRadius: 12,
                                                padding: '12px 16px',
                                                border: `1px solid ${badgeBorder}`,
                                                boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                                <Tag
                                                    style={{
                                                        color: badgeColor,
                                                        background: badgeBg,
                                                        borderColor: badgeBorder,
                                                        borderRadius: 6,
                                                        fontWeight: 700,
                                                        fontSize: '0.75rem',
                                                        margin: 0,
                                                    }}
                                                >
                                                    {ex.levelLabel || ex.level}
                                                </Tag>
                                                <Button
                                                    type="text"
                                                    size="small"
                                                    icon={<SoundOutlined />}
                                                    onClick={() => onPlayAudio(ex.sentence)}
                                                    style={{ color: badgeColor }}
                                                />
                                            </div>
                                            <div style={{ color: '#0f172a', fontWeight: 600, fontSize: '0.95rem', lineHeight: 1.5, marginBottom: 2 }}>
                                                {ex.sentence}
                                            </div>
                                            {ex.meaningVi && (
                                                <div style={{ color: '#64748b', fontSize: '0.825rem', fontStyle: 'italic' }}>
                                                    👉 {ex.meaningVi}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {sentenceFeedback.improvedSentenceBand8 && (
                        <div style={{ background: '#ffffff', borderRadius: 10, padding: '12px 16px', border: '1px solid #cbd5e1' }}>
                            <Text style={{ fontSize: '0.825rem', color: '#2563eb', fontWeight: 700, display: 'block', marginBottom: 4 }}>
                                💎 Gợi ý viết lại tự nhiên hơn (IELTS Band 8.5+):
                            </Text>
                            <Text strong style={{ color: '#0f172a' }}>
                                {sentenceFeedback.improvedSentenceBand8}
                            </Text>
                            <Button
                                type="text"
                                size="small"
                                icon={<SoundOutlined />}
                                onClick={() => onPlayAudio(sentenceFeedback.improvedSentenceBand8!)}
                                style={{ marginLeft: 8 }}
                            />
                        </div>
                    )}

                    <div style={{ marginTop: 16, textAlign: 'right' }}>
                        <Button type="primary" onClick={onNextCard}>
                            Từ tiếp theo →
                        </Button>
                    </div>
                </div>
            )}
        </Card>
    );
};

