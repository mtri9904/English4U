import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Progress, Tag, Typography } from 'antd';
import {
    ArrowRightOutlined,
    CheckCircleOutlined,
    EyeInvisibleOutlined,
    EyeOutlined,
    LoadingOutlined,
    PlayCircleOutlined,
    SoundOutlined,
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import type {
    DictationExercise,
    DictationItem,
    SentenceEvaluation,
} from '../types/dictation.types';
import { CURATED_VOICES } from '../constants/dictation.constants';
import { useDictationAudio } from '../hooks/useDictationAudio';
import { evaluateDictation } from '../utils/dictationDiff.utils';
import { DictationToolbar } from './DictationToolbar';
import { DictationClozeInput } from './DictationClozeInput';
import { DictationDiffView } from './DictationDiffView';
import { DictationParagraphAssembly } from './DictationParagraphAssembly';

const { Text } = Typography;

export interface DictationRunnerProps {
    exercise: DictationExercise;
    initialVoiceId?: string;
    onFinish: (evaluations: SentenceEvaluation[], userInputs: string[]) => void;
    onExit: () => void;
}

export const DictationRunner: React.FC<DictationRunnerProps> = ({
    exercise,
    initialVoiceId = 'en-US-JennyNeural',
    onFinish,
    onExit,
}) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [inputs, setInputs] = useState<string[]>(() =>
        exercise.items.map(() => '')
    );
    const [evaluations, setEvaluations] = useState<Array<SentenceEvaluation | null>>(() =>
        exercise.items.map(() => null)
    );
    const [isChecked, setIsChecked] = useState(false);
    const [showTranslation, setShowTranslation] = useState(false);
    const [clozeInputs, setClozeInputs] = useState<Record<number, Record<number, string>>>({});

    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const {
        selectedVoiceId,
        setSelectedVoiceId,
        rate,
        setRate,
        isPlaying,
        isLoadingAudio,
        speak,
        stop,
    } = useDictationAudio();

    useEffect(() => {
        if (initialVoiceId) {
            setSelectedVoiceId(initialVoiceId);
        }
    }, [initialVoiceId, setSelectedVoiceId]);

    const currentItem: DictationItem | undefined = exercise.items[currentIndex];
    const isLast = currentIndex === exercise.items.length - 1;

    const currentVoice = useMemo(
        () => CURATED_VOICES.find((v) => v.id === selectedVoiceId) ?? CURATED_VOICES[0],
        [selectedVoiceId]
    );

    // Cleanup on unmount (e.g. user clicks Exit / Thoát)
    useEffect(() => {
        return () => {
            stop();
        };
    }, [stop]);

    // Reset state & focus on index change (no auto-play; only plays when user clicks Play)
    useEffect(() => {
        if (!currentItem) return;
        setIsChecked(false);
        setShowTranslation(false);
        stop();

        const timer = setTimeout(() => {
            textareaRef.current?.focus();
        }, 100);

        return () => clearTimeout(timer);
    }, [currentIndex, currentItem, stop]);

    // Handle check evaluation
    const handleCheck = () => {
        if (!currentItem) return;

        let userText = inputs[currentIndex] || '';
        if (exercise.format === 'cloze' && currentItem.clozeTokens) {
            const words = currentItem.clozeTokens.map((t, idx) => {
                if (t.isMasked) {
                    return clozeInputs[currentIndex]?.[idx] || '';
                }
                return t.word;
            });
            userText = words.join(' ');
            const nextInputs = [...inputs];
            nextInputs[currentIndex] = userText;
            setInputs(nextInputs);
        }

        const evaluation = evaluateDictation(
            userText,
            currentItem.sentence,
            currentItem.blindSpots
        );

        const nextEvals = [...evaluations];
        nextEvals[currentIndex] = evaluation;
        setEvaluations(nextEvals);
        setIsChecked(true);
    };

    // Handle Next or Complete
    const handleNext = () => {
        if (!isChecked) {
            handleCheck();
            return;
        }

        if (isLast) {
            const finalEvals: SentenceEvaluation[] = evaluations.map((ev, idx) => {
                if (ev) return ev;
                return evaluateDictation(
                    inputs[idx] || '',
                    exercise.items[idx].sentence,
                    exercise.items[idx].blindSpots
                );
            });
            onFinish(finalEvals, inputs);
        } else {
            setCurrentIndex((prev) => prev + 1);
        }
    };

    // Hotkey listener (Ctrl+Space: Play/Replay, Enter: Check/Next)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || isChecked)) {
                e.preventDefault();
                handleNext();
            } else if ((e.ctrlKey || e.altKey) && e.code === 'Space') {
                e.preventDefault();
                if (currentItem) {
                    speak(currentItem.sentence);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentItem, isChecked, isLast, evaluations, inputs, handleNext, speak]);

    const handleVoiceSelect = (voiceId: string) => {
        setSelectedVoiceId(voiceId);
    };

    const handleClozeChange = (tokenIndex: number, value: string) => {
        setClozeInputs((prev) => ({
            ...prev,
            [currentIndex]: {
                ...(prev[currentIndex] || {}),
                [tokenIndex]: value,
            },
        }));
        if (isChecked) setIsChecked(false);
    };

    const currentEval = evaluations[currentIndex];

    return (
        <div style={{ maxWidth: 1220, margin: '0 auto', width: '100%', padding: '6px 0 32px' }}>
            {/* Top Toolbar */}
            <DictationToolbar
                title={exercise.title}
                format={exercise.format}
                currentIndex={currentIndex}
                totalItems={exercise.items.length}
                rate={rate}
                onRateChange={setRate}
                currentVoice={currentVoice}
                onVoiceSelect={handleVoiceSelect}
                onExit={() => {
                    stop();
                    onExit();
                }}
                fullParagraph={exercise.fullParagraph}
                onPlayFullParagraph={() => exercise.fullParagraph && speak(exercise.fullParagraph)}
            />

            {/* Progress Bar */}
            <Progress
                percent={Math.round(((currentIndex + (isChecked ? 1 : 0)) / exercise.items.length) * 100)}
                strokeColor="#4f46e5"
                showInfo={false}
                style={{ marginBottom: 16 }}
            />

            {/* Paragraph Navigation Chunks (If paragraph mode) */}
            {exercise.format === 'paragraph' && (
                <div
                    style={{
                        display: 'flex',
                        gap: 8,
                        overflowX: 'auto',
                        paddingBottom: 8,
                        marginBottom: 16,
                    }}
                >
                    {exercise.items.map((it, idx) => {
                        const isDone = evaluations[idx] != null;
                        const isCurrent = idx === currentIndex;
                        return (
                            <button
                                key={it.id}
                                type="button"
                                onClick={() => setCurrentIndex(idx)}
                                style={{
                                    border: isCurrent ? '2px solid #4f46e5' : '1px solid #e2e8f0',
                                    background: isCurrent ? '#ede9fe' : isDone ? '#f0fdf4' : '#fff',
                                    color: isCurrent ? '#4f46e5' : isDone ? '#16a34a' : '#64748b',
                                    fontWeight: 700,
                                    fontSize: 12,
                                    padding: '6px 14px',
                                    borderRadius: 999,
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                }}
                            >
                                {isDone && <CheckCircleOutlined />}
                                <span>Câu {idx + 1}</span>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Main Interactive Practice Box */}
            <Card
                style={{
                    borderRadius: 24,
                    boxShadow: '0 12px 35px rgba(15, 23, 42, 0.06)',
                    border: '1px solid #e2e8f0',
                    background: '#fff',
                    marginBottom: 20,
                }}
                styles={{ body: { padding: '28px 32px' } }}
            >
                {/* Audio Trigger Row */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 16,
                        marginBottom: 28,
                    }}
                >
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                        <Button
                            type="primary"
                            shape="circle"
                            size="large"
                            icon={isLoadingAudio ? <LoadingOutlined /> : isPlaying ? <SoundOutlined /> : <PlayCircleOutlined />}
                            onClick={() => currentItem && speak(currentItem.sentence)}
                            disabled={isLoadingAudio}
                            style={{
                                width: 72,
                                height: 72,
                                fontSize: 30,
                                background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                                border: 'none',
                                boxShadow: '0 8px 24px rgba(79, 70, 229, 0.35)',
                                display: 'grid',
                                placeItems: 'center',
                            }}
                        />
                    </motion.div>
                </div>

                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                    {isLoadingAudio ? (
                        <Text style={{ fontSize: 13, color: '#4f46e5', fontWeight: 600 }}>
                            Đang tải giọng đọc AI phòng thu ({currentVoice.name})...
                        </Text>
                    ) : (
                        <Text type="secondary" style={{ fontSize: 13 }}>
                            Bấm nút <strong>Play</strong> ở trên hoặc nhấn <strong>Ctrl + Space</strong> để nghe • Nhấn <strong>Enter</strong> để kiểm tra
                        </Text>
                    )}
                </div>

                {/* Input Mode: Sentences / Paragraph (Full Dictation) */}
                {exercise.format !== 'cloze' && (
                    <div style={{ marginBottom: 20 }}>
                        <textarea
                            ref={textareaRef}
                            value={inputs[currentIndex] || ''}
                            onChange={(e) => {
                                const nextInputs = [...inputs];
                                nextInputs[currentIndex] = e.target.value;
                                setInputs(nextInputs);
                                if (isChecked) setIsChecked(false);
                            }}
                            placeholder="Nghe và gõ lại chính xác những gì bạn nghe được ở đây..."
                            rows={3}
                            style={{
                                width: '100%',
                                padding: '16px 20px',
                                borderRadius: 16,
                                border: isChecked
                                    ? (currentEval?.accuracyPercent ?? 0) >= 80
                                        ? '2px solid #10b981'
                                        : '2px solid #f59e0b'
                                    : '1.5px solid #cbd5e1',
                                fontSize: 17,
                                lineHeight: 1.6,
                                outline: 'none',
                                fontFamily: 'inherit',
                                resize: 'none',
                                transition: 'all 0.2s ease',
                                background: '#f8fafc',
                                color: '#1e293b',
                            }}
                        />
                    </div>
                )}

                {/* Input Mode: Cloze (Audio Cloze Test) */}
                {exercise.format === 'cloze' && currentItem?.clozeTokens && (
                    <DictationClozeInput
                        tokens={currentItem.clozeTokens}
                        inputs={clozeInputs[currentIndex] || {}}
                        onChange={handleClozeChange}
                        isChecked={isChecked}
                    />
                )}

                {/* 3-Color Realtime Checked Diff Preview */}
                <DictationDiffView
                    isChecked={isChecked}
                    evaluation={currentEval}
                    targetSentence={currentItem?.sentence}
                />

                {/* Translation & Focus Word Helper */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 12,
                        marginBottom: 20,
                    }}
                >
                    <Button
                        type="dashed"
                        size="small"
                        icon={showTranslation ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                        onClick={() => setShowTranslation(!showTranslation)}
                        style={{ borderRadius: 8 }}
                    >
                        {showTranslation ? 'Ẩn nghĩa tiếng Việt' : 'Xem nghĩa tiếng Việt'}
                    </Button>

                    {currentItem?.focusWord && (
                        <Tag color="indigo" style={{ borderRadius: 8, padding: '4px 10px' }}>
                            💡 Từ khóa: <strong>{currentItem.focusWord}</strong>
                            {currentItem.focusWordDefinition && ` – ${currentItem.focusWordDefinition}`}
                        </Tag>
                    )}
                </div>

                {showTranslation && currentItem && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        style={{
                            padding: '12px 16px',
                            background: '#eff6ff',
                            borderRadius: 12,
                            color: '#1e40af',
                            marginBottom: 20,
                            fontSize: 14,
                        }}
                    >
                        🇻🇳 <strong>Dịch nghĩa:</strong> {currentItem.translation}
                    </motion.div>
                )}

                {/* Bottom Action Bar */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                    {!isChecked ? (
                        <Button
                            type="primary"
                            size="large"
                            onClick={handleCheck}
                            style={{
                                borderRadius: 12,
                                minWidth: 140,
                                fontWeight: 700,
                                background: '#4f46e5',
                            }}
                        >
                            Kiểm tra (Enter)
                        </Button>
                    ) : (
                        <Button
                            type="primary"
                            size="large"
                            icon={<ArrowRightOutlined />}
                            onClick={handleNext}
                            style={{
                                borderRadius: 12,
                                minWidth: 150,
                                fontWeight: 700,
                                background: '#10b981',
                                borderColor: '#10b981',
                            }}
                        >
                            {isLast ? 'Hoàn thành bài tập' : 'Câu tiếp theo'}
                        </Button>
                    )}
                </div>
            </Card>

            {/* Paragraph Assembly View (If in paragraph mode) */}
            {exercise.format === 'paragraph' && (
                <DictationParagraphAssembly
                    items={exercise.items}
                    currentIndex={currentIndex}
                    evaluations={evaluations}
                    inputs={inputs}
                />
            )}
        </div>
    );
};
