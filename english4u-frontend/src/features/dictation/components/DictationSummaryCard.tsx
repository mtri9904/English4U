import React, { useMemo } from 'react';
import {
    Button,
    Card,
    Col,
    Progress,
    Row,
    Space,
    Statistic,
    Tag,
    Typography,
    message,
} from 'antd';
import {
    CheckCircleOutlined,
    CloseCircleOutlined,
    PlusOutlined,
    RedoOutlined,
    SoundOutlined,
    TrophyOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import type {
    DictationExercise,
    SentenceEvaluation,
} from '../types/dictation.types';
import { useDictationAudio } from '../hooks/useDictationAudio';

const { Title, Text, Paragraph } = Typography;

export interface DictationSummaryCardProps {
    exercise: DictationExercise;
    evaluations: SentenceEvaluation[];
    userInputs: string[];
    onRetry: () => void;
    onNewExercise: () => void;
}

export const DictationSummaryCard: React.FC<DictationSummaryCardProps> = ({
    exercise,
    evaluations,
    userInputs,
    onRetry,
    onNewExercise,
}) => {
    const { speak } = useDictationAudio();

    // Aggregated statistics
    const stats = useMemo(() => {
        let totalCorrect = 0;
        let totalIncorrect = 0;
        let totalBlindSpots = 0;
        let totalTargetWords = 0;

        evaluations.forEach((ev) => {
            totalCorrect += ev.correctCount;
            totalIncorrect += ev.incorrectCount;
            totalBlindSpots += ev.blindSpotMissCount;
            totalTargetWords += ev.totalTargetWords;
        });

        const overallAccuracy =
            totalTargetWords > 0
                ? Math.round((totalCorrect / totalTargetWords) * 100)
                : 0;

        return {
            overallAccuracy,
            totalCorrect,
            totalIncorrect,
            totalBlindSpots,
            totalTargetWords,
        };
    }, [evaluations]);

    // Unique missed / typo words for quick flashcard addition
    const missedWords = useMemo(() => {
        const words = new Set<string>();
        evaluations.forEach((ev) => {
            ev.tokens.forEach((t) => {
                if (t.status === 'incorrect' && t.targetWord) {
                    words.add(t.targetWord);
                } else if (t.status === 'missing' && t.targetWord) {
                    words.add(t.targetWord);
                }
            });
        });
        return Array.from(words);
    }, [evaluations]);

    // Unique acoustic blind spots
    const blindSpotWords = useMemo(() => {
        const words = new Set<string>();
        evaluations.forEach((ev) => {
            ev.tokens.forEach((t) => {
                if (t.status === 'blindspot' && t.targetWord) {
                    words.add(t.targetWord);
                }
            });
        });
        return Array.from(words);
    }, [evaluations]);

    const handleAddFlashcard = (word: string) => {
        message.success(`Đã thêm từ "${word}" vào bộ Flashcard Từ vựng!`);
    };

    return (
        <div style={{ maxWidth: 1220, margin: '0 auto', width: '100%', padding: '12px 0 40px' }}>
            {/* Top Score Banner */}
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
            >
                <Card
                    style={{
                        borderRadius: 24,
                        boxShadow: '0 16px 40px rgba(15, 23, 42, 0.08)',
                        border: '1px solid #e2e8f0',
                        background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                        marginBottom: 24,
                    }}
                    styles={{ body: { padding: '32px 36px' } }}
                >
                    <div style={{ textAlign: 'center', marginBottom: 28 }}>
                        <div
                            style={{
                                width: 56,
                                height: 56,
                                borderRadius: 20,
                                background: 'rgba(79, 70, 229, 0.1)',
                                color: '#4f46e5',
                                display: 'grid',
                                placeItems: 'center',
                                margin: '0 auto 12px',
                                fontSize: 26,
                            }}
                        >
                            <TrophyOutlined />
                        </div>
                        <Title level={2} style={{ margin: 0, fontWeight: 850, color: '#1e293b' }}>
                            Hoàn thành bài Luyện chép chính tả!
                        </Title>
                        <Text type="secondary" style={{ fontSize: 14 }}>
                            {exercise.title} • {exercise.items.length} câu đã luyện
                        </Text>
                    </div>

                    <Row gutter={[20, 20]} align="middle">
                        <Col xs={24} md={8} style={{ textAlign: 'center' }}>
                            <Progress
                                type="circle"
                                percent={stats.overallAccuracy}
                                strokeColor={
                                    stats.overallAccuracy >= 80
                                        ? '#10b981'
                                        : stats.overallAccuracy >= 60
                                        ? '#f59e0b'
                                        : '#ef4444'
                                }
                                strokeWidth={10}
                                size={140}
                                format={(percent) => (
                                    <div>
                                        <div style={{ fontSize: 32, fontWeight: 900, color: '#1e293b' }}>
                                            {percent}%
                                        </div>
                                        <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>
                                            Chính xác
                                        </div>
                                    </div>
                                )}
                            />
                        </Col>

                        <Col xs={24} md={16}>
                            <Row gutter={[16, 16]}>
                                <Col span={8}>
                                    <div
                                        style={{
                                            padding: '14px 18px',
                                            borderRadius: 16,
                                            background: '#f0fdf4',
                                            border: '1px solid #bbf7d0',
                                        }}
                                    >
                                        <Statistic
                                            title={<span style={{ color: '#166534', fontWeight: 600 }}>Từ đúng</span>}
                                            value={stats.totalCorrect}
                                            prefix={<CheckCircleOutlined style={{ color: '#16a34a' }} />}
                                            valueStyle={{ color: '#15803d', fontWeight: 850 }}
                                        />
                                    </div>
                                </Col>
                                <Col span={8}>
                                    <div
                                        style={{
                                            padding: '14px 18px',
                                            borderRadius: 16,
                                            background: '#fef2f2',
                                            border: '1px solid #fecaca',
                                        }}
                                    >
                                        <Statistic
                                            title={<span style={{ color: '#991b1b', fontWeight: 600 }}>Lỗi chính tả</span>}
                                            value={stats.totalIncorrect}
                                            prefix={<CloseCircleOutlined style={{ color: '#dc2626' }} />}
                                            valueStyle={{ color: '#b91c1c', fontWeight: 850 }}
                                        />
                                    </div>
                                </Col>
                                <Col span={8}>
                                    <div
                                        style={{
                                            padding: '14px 18px',
                                            borderRadius: 16,
                                            background: '#fffbeb',
                                            border: '1px solid #fde68a',
                                        }}
                                    >
                                        <Statistic
                                            title={<span style={{ color: '#92400e', fontWeight: 600 }}>Điểm mù âm</span>}
                                            value={stats.totalBlindSpots}
                                            prefix={<WarningOutlined style={{ color: '#d97706' }} />}
                                            valueStyle={{ color: '#b45309', fontWeight: 850 }}
                                        />
                                    </div>
                                </Col>
                            </Row>
                        </Col>
                    </Row>
                </Card>
            </motion.div>

            {/* Acoustic Blind Spots Callout */}
            {blindSpotWords.length > 0 && (
                <Card
                    style={{
                        borderRadius: 20,
                        border: '1px solid #fde68a',
                        background: '#fffdf5',
                        marginBottom: 20,
                    }}
                    styles={{ body: { padding: '20px 24px' } }}
                >
                    <Space align="start" size={14}>
                        <div
                            style={{
                                width: 38,
                                height: 38,
                                borderRadius: 12,
                                background: '#fef3c7',
                                color: '#b45309',
                                display: 'grid',
                                placeItems: 'center',
                                fontSize: 18,
                                flex: '0 0 38px',
                            }}
                        >
                            <WarningOutlined />
                        </div>
                        <div>
                            <Text strong style={{ fontSize: 15, color: '#92400e' }}>
                                Điểm mù âm thanh phát hiện trong bài luyện:
                            </Text>
                            <Paragraph style={{ color: '#78350f', fontSize: 13, margin: '4px 0 10px' }}>
                                Bạn có xu hướng bỏ sót các mạo từ hoặc giới từ bị nuốt âm (weak forms) như:
                            </Paragraph>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {blindSpotWords.map((word) => (
                                    <Tag
                                        key={word}
                                        color="warning"
                                        style={{
                                            fontSize: 13,
                                            fontWeight: 700,
                                            borderRadius: 8,
                                            padding: '3px 10px',
                                        }}
                                    >
                                        {word}
                                    </Tag>
                                ))}
                            </div>
                        </div>
                    </Space>
                </Card>
            )}

            {/* Missed Words -> 1-Click Flashcard */}
            {missedWords.length > 0 && (
                <Card
                    title={
                        <Space>
                            <span style={{ fontSize: 16 }}>📝</span>
                            <Text strong style={{ fontSize: 15 }}>
                                Từ vựng sai / bỏ sót ({missedWords.length} từ)
                            </Text>
                        </Space>
                    }
                    style={{
                        borderRadius: 20,
                        border: '1px solid #e2e8f0',
                        marginBottom: 24,
                    }}
                >
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                        {missedWords.map((word) => (
                            <Button
                                key={word}
                                size="small"
                                icon={<PlusOutlined />}
                                onClick={() => handleAddFlashcard(word)}
                                style={{
                                    borderRadius: 999,
                                    borderColor: '#cbd5e1',
                                    fontWeight: 600,
                                    color: '#334155',
                                }}
                            >
                                {word}
                            </Button>
                        ))}
                    </div>
                </Card>
            )}

            {/* Sentence-by-Sentence Detailed Review */}
            <Title level={4} style={{ color: '#1e293b', marginBottom: 14 }}>
                Chi tiết từng câu & Luyện Shadowing
            </Title>

            <div style={{ display: 'grid', gap: 14, marginBottom: 28 }}>
                {exercise.items.map((item, idx) => {
                    const ev = evaluations[idx];
                    return (
                        <Card
                            key={item.id}
                            style={{
                                borderRadius: 18,
                                border: '1px solid #e2e8f0',
                                boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)',
                            }}
                            styles={{ body: { padding: '18px 22px' } }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    marginBottom: 10,
                                }}
                            >
                                <Space size={8}>
                                    <Tag color="geekblue" style={{ borderRadius: 6, fontWeight: 700 }}>
                                        Câu {idx + 1}
                                    </Tag>
                                    {ev && (
                                        <Tag
                                            color={
                                                ev.accuracyPercent >= 80
                                                    ? 'success'
                                                    : ev.accuracyPercent >= 50
                                                    ? 'warning'
                                                    : 'error'
                                            }
                                            style={{ borderRadius: 6, fontWeight: 700 }}
                                        >
                                            {ev.accuracyPercent}%
                                        </Tag>
                                    )}
                                </Space>

                                <Button
                                    size="small"
                                    icon={<SoundOutlined />}
                                    onClick={() => speak(item.sentence)}
                                    style={{ borderRadius: 999, fontWeight: 600 }}
                                >
                                    Nghe lại
                                </Button>
                            </div>

                            {/* Diff token rendering */}
                            <div style={{ fontSize: 16, lineHeight: 1.8, marginBottom: 8 }}>
                                {ev ? (
                                    ev.tokens.map((token) => {
                                        if (token.status === 'correct') {
                                            return (
                                                <span
                                                    key={token.id}
                                                    style={{ color: '#10b981', fontWeight: 700, marginRight: 6 }}
                                                >
                                                    {token.word}
                                                </span>
                                            );
                                        }
                                        if (token.status === 'blindspot') {
                                            return (
                                                <span
                                                    key={token.id}
                                                    style={{
                                                        background: '#fef3c7',
                                                        color: '#b45309',
                                                        borderRadius: 4,
                                                        padding: '1px 5px',
                                                        fontWeight: 700,
                                                        marginRight: 6,
                                                      }}
                                                >
                                                    {token.targetWord}
                                                </span>
                                            );
                                        }
                                        if (token.status === 'missing') {
                                            return (
                                                <span
                                                    key={token.id}
                                                    style={{
                                                        background: '#fee2e2',
                                                        color: '#b91c1c',
                                                        borderRadius: 4,
                                                        padding: '1px 5px',
                                                        fontWeight: 700,
                                                        marginRight: 6,
                                                    }}
                                                >
                                                    {token.targetWord}
                                                </span>
                                            );
                                        }
                                        return (
                                            <span
                                                key={token.id}
                                                style={{
                                                    textDecoration: 'line-through',
                                                    color: '#ef4444',
                                                    fontWeight: 600,
                                                    marginRight: 6,
                                                }}
                                            >
                                                {token.word}
                                                {token.suggestion && ` (${token.suggestion})`}
                                            </span>
                                        );
                                    })
                                ) : (
                                    <Text>{userInputs[idx] || '(Chưa điền)'}</Text>
                                )}
                            </div>

                            <Text type="secondary" style={{ fontSize: 13, display: 'block' }}>
                                🎯 Chuẩn: {item.sentence}
                            </Text>
                            <Text type="secondary" style={{ fontSize: 12, display: 'block', color: '#64748b' }}>
                                🇻🇳 {item.translation}
                            </Text>
                        </Card>
                    );
                })}
            </div>

            {/* Bottom Controls */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: 16,
                    paddingTop: 12,
                }}
            >
                <Button
                    size="large"
                    icon={<RedoOutlined />}
                    onClick={onRetry}
                    style={{
                        borderRadius: 14,
                        minWidth: 160,
                        fontWeight: 700,
                    }}
                >
                    Luyện lại bài này
                </Button>
                <Button
                    type="primary"
                    size="large"
                    onClick={onNewExercise}
                    style={{
                        borderRadius: 14,
                        minWidth: 170,
                        fontWeight: 700,
                        background: '#4f46e5',
                    }}
                >
                    Tạo bài luyện mới
                </Button>
            </div>
        </div>
    );
};

