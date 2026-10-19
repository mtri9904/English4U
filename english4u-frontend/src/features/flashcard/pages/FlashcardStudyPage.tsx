import React, { useState, useEffect, useMemo } from 'react';
import {
    Card,
    Button,
    Radio,
    Input,
    Progress,
    Space,
    Typography,
    Tag,
    message,
    Spin,
    Empty,
} from 'antd';
import {
    ArrowLeftOutlined,
    SoundOutlined,
    RetweetOutlined,
    EditOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    AudioOutlined,
    BulbOutlined,
    QuestionCircleOutlined,
    TrophyOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
    useFlashcardDeckDetailQuery,
    useStudyCardsQuery,
    flashcardApi,
    flashcardKeys,
} from '../api/flashcard.api';
import type { FlashcardItemDto, AiCheckSentenceResponse } from '../types/flashcard.types';


const { Title, Text, Paragraph } = Typography;

type StudyMode = 'flip' | 'sentence' | 'quiz' | 'pronounce';

export const FlashcardStudyPage: React.FC = () => {
    const { deckId = '' } = useParams<{ deckId: string }>();
    const [searchParams] = useSearchParams();
    const targetCardId = searchParams.get('cardId');
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const { data: deck } = useFlashcardDeckDetailQuery(deckId);
    const { data: cards = [], isLoading } = useStudyCardsQuery(deckId, false);

    const [mode, setMode] = useState<StudyMode>('flip');
    const [currentIndex, setCurrentIndex] = useState(0);

    // Jump to requested card if specified in query param
    useEffect(() => {
        if (targetCardId && cards.length > 0) {
            const idx = cards.findIndex((c) => c.id.toLowerCase() === targetCardId.toLowerCase());
            if (idx !== -1) {
                setCurrentIndex(idx);
            }
        }
    }, [targetCardId, cards]);
    const [isFlipped, setIsFlipped] = useState(false);
    const [completedCount, setCompletedCount] = useState(0);

    // Mode 2: Sentence Writing states
    const [userSentence, setUserSentence] = useState('');
    const [isCheckingSentence, setIsCheckingSentence] = useState(false);
    const [sentenceFeedback, setSentenceFeedback] = useState<AiCheckSentenceResponse | null>(null);

    // Mode 3: Quiz states
    const [selectedQuizAnswer, setSelectedQuizAnswer] = useState<string | null>(null);
    const [isQuizAnswered, setIsQuizAnswered] = useState(false);

    // Mode 4: Pronunciation states
    const [isListeningSpeech, setIsListeningSpeech] = useState(false);
    const [spokenResult, setSpokenResult] = useState<{ text: string; isCorrect: boolean } | null>(null);

    const currentCard: FlashcardItemDto | undefined = cards[currentIndex];

    // Sound synthesis & real audio player
    const playAudio = (text: string, audioUrl?: string) => {
        if (audioUrl) {
            try {
                const audio = new Audio(audioUrl);
                audio.play().catch(() => playSpeech(text));
                return;
            } catch {
                // fallback to speech synthesis
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

    // Auto play audio when card changes
    useEffect(() => {
        if (currentCard) {
            setIsFlipped(false);
            setUserSentence('');
            setSentenceFeedback(null);
            setSelectedQuizAnswer(null);
            setIsQuizAnswered(false);
            setSpokenResult(null);
            playAudio(currentCard.word, currentCard.audioUrl);
        }
    }, [currentIndex, currentCard]);

    // Keyboard shortcuts for Flashcard Flip
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (mode !== 'flip') return;
            if (e.code === 'Space') {
                e.preventDefault();
                setIsFlipped((prev) => !prev);
            } else if (isFlipped) {
                if (e.key === '1') handleRate(1);
                if (e.key === '2') handleRate(2);
                if (e.key === '3') handleRate(3);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isFlipped, mode, currentIndex, currentCard]);

    const handleRate = async (rating: number) => {
        if (!currentCard) return;

        try {
            await flashcardApi.reviewCard(currentCard.id, rating);
            setCompletedCount((c) => c + 1);

            if (currentIndex + 1 < cards.length) {
                setCurrentIndex((i) => i + 1);
            } else {
                message.success('Chúc mừng! Bạn đã hoàn thành phiên học với bộ thẻ này!');
                queryClient.invalidateQueries({ queryKey: flashcardKeys.deckCards(deckId) });
                queryClient.invalidateQueries({ queryKey: flashcardKeys.allDecks });
            }
        } catch {
            message.error('Không thể lưu kết quả ôn tập.');
        }
    };

    // Sentence Writing with AI
    const handleCheckSentence = async () => {
        if (!currentCard || !userSentence.trim()) {
            message.warning('Vui lòng nhập câu của bạn trước!');
            return;
        }

        try {
            setIsCheckingSentence(true);
            const feedback = await flashcardApi.checkSentence(
                currentCard.word,
                currentCard.meaningVi,
                userSentence.trim()
            );
            setSentenceFeedback(feedback);
        } catch {
            message.error('Không thể chấm câu lúc này. Vui lòng thử lại.');
        } finally {
            setIsCheckingSentence(false);
        }
    };

    // Quiz Options generation: Choices come exclusively from AI-generated distractors or real cards in deck
    const quizOptions = useMemo(() => {
        if (!currentCard || cards.length === 0) return [];
        const correct = currentCard.meaningVi?.trim() || '';

        // Priority 1: Card-specific AI generated distractors
        const cardDistractors = currentCard.quizDistractors
            ? currentCard.quizDistractors
                .split('|')
                .map((d) => d.trim())
                .filter((d) => d.length > 0 && d !== correct)
            : [];

        // Priority 2: Other real vocabulary cards in the current deck
        const otherFromDeck = cards
            .filter((c) => c.id !== currentCard.id && c.meaningVi && c.meaningVi.trim() !== correct)
            .map((c) => c.meaningVi.trim());

        // Merge real options (up to 5 distractors)
        const distractors = Array.from(new Set([...cardDistractors, ...otherFromDeck]))
            .slice(0, 5);

        return [correct, ...distractors].sort(() => 0.5 - Math.random());
    }, [currentCard, cards]);

    const handleSelectQuizAnswer = (option: string) => {
        if (isQuizAnswered || !currentCard) return;
        setSelectedQuizAnswer(option);
        setIsQuizAnswered(true);

        if (option === currentCard.meaningVi) {
            message.success('Chính xác! Rất tuyệt vời.');
            handleRate(3);
        } else {
            message.error('Chưa chính xác! Hãy xem lại nghĩa nhé.');
            handleRate(1);
        }
    };

    // Pronunciation Recognition
    const handleStartSpeech = () => {
        if (!currentCard) return;

        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            message.info('Trình duyệt của bạn chưa hỗ trợ Web Speech API. Bạn có thể luyện nghe phát âm bằng nút loa nhé!');
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        setIsListeningSpeech(true);
        setSpokenResult(null);

        recognition.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript.toLowerCase().trim();
            const target = currentCard.word.toLowerCase().trim();
            const isMatch = transcript.includes(target) || target.includes(transcript);

            setSpokenResult({ text: transcript, isCorrect: isMatch });
            setIsListeningSpeech(false);

            if (isMatch) {
                message.success(`Tuyệt vời! Bạn phát âm rất chuẩn từ "${currentCard.word}".`);
                handleRate(4);
            } else {
                message.warning(`Bạn đọc là "${transcript}". Hãy thử bấm loa nghe lại và phát âm lại nhé.`);
            }
        };

        recognition.onerror = () => {
            setIsListeningSpeech(false);
            message.warning('Không nhận diện được giọng nói. Vui lòng kiểm tra micro!');
        };

        recognition.onend = () => {
            setIsListeningSpeech(false);
        };

        recognition.start();
    };

    if (isLoading) {
        return (
            <div style={{ textAlign: 'center', padding: '100px 0' }}>
                <Spin size="large" />
                <div style={{ marginTop: 12, color: '#64748b' }}>Đang nạp dữ liệu thẻ ôn tập...</div>
            </div>
        );
    }

    if (cards.length === 0) {
        return (
            <Card style={{ maxWidth: 600, margin: '60px auto', textAlign: 'center', borderRadius: 20 }}>
                <Empty description="Bộ thẻ này chưa có từ vựng nào để học." />
                <Button type="primary" onClick={() => navigate(`/app/flashcards/${deckId}`)} style={{ marginTop: 16 }}>
                    Quay lại thêm từ vựng
                </Button>
            </Card>
        );
    }

    const isAllCompleted = currentIndex >= cards.length;

    if (isAllCompleted) {
        return (
            <div style={{ maxWidth: 650, margin: '60px auto', textAlign: 'center', padding: '0 16px' }}>
                <Card style={{ borderRadius: 24, padding: '40px 24px', boxShadow: '0 16px 40px rgba(0,0,0,0.06)' }}>
                    <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#f0fdf4', color: '#16a34a', fontSize: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                        <TrophyOutlined />
                    </div>
                    <Title level={2} style={{ color: '#0f172a', fontWeight: 800, margin: '0 0 12px' }}>
                        Hoàn thành phiên học!
                    </Title>
                    <Paragraph style={{ color: '#64748b', fontSize: '1rem', maxWidth: 450, margin: '0 auto 24px' }}>
                        Bạn đã xuất sắc ôn tập qua <strong>{completedCount > 0 ? completedCount : cards.length}</strong> từ vựng trong bộ thẻ này. Hệ thống đã lưu lại tiến trình ghi nhớ của bạn!
                    </Paragraph>
                    <Space size="middle">
                        <Button
                            type="primary"
                            size="large"
                            onClick={() => {
                                setCurrentIndex(0);
                                setCompletedCount(0);
                            }}
                            style={{ height: 44, borderRadius: 12, fontWeight: 700 }}
                        >
                            Học lại từ đầu
                        </Button>
                        <Button
                            size="large"
                            onClick={() => navigate(`/app/flashcards/${deckId}`)}
                            style={{ height: 44, borderRadius: 12, fontWeight: 600 }}
                        >
                            Về danh sách thẻ
                        </Button>
                    </Space>
                </Card>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: 850, margin: '0 auto', padding: '8px 16px 60px' }}>
            {/* Top Navigation */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Button
                    type="text"
                    icon={<ArrowLeftOutlined />}
                    onClick={() => navigate(`/app/flashcards/${deckId}`)}
                    style={{ paddingLeft: 0, color: '#475569', fontWeight: 600 }}
                >
                    {deck?.title || 'Bộ thẻ'}
                </Button>
                <div style={{ color: '#64748b', fontWeight: 600 }}>
                    Thẻ {currentIndex + 1} / {cards.length}
                </div>
            </div>

            {/* Progress Bar */}
            <Progress
                percent={Math.round(((currentIndex) / cards.length) * 100)}
                strokeColor={{ '0%': '#2563eb', '100%': '#38bdf8' }}
                showInfo={false}
                style={{ marginBottom: 20 }}
            />

            {/* Mode Switcher Tabs */}
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <Radio.Group
                    value={mode}
                    onChange={(e) => setMode(e.target.value)}
                    buttonStyle="solid"
                    size="large"
                >
                    <Radio.Button value="flip" style={{ borderRadius: '12px 0 0 12px', fontWeight: 600 }}>
                        <RetweetOutlined /> 1. Lật thẻ SM-2
                    </Radio.Button>
                    <Radio.Button value="sentence" style={{ fontWeight: 600 }}>
                        <EditOutlined /> 2. Luyện viết câu AI
                    </Radio.Button>
                    <Radio.Button value="quiz" style={{ fontWeight: 600 }}>
                        <QuestionCircleOutlined /> 3. Trắc nghiệm
                    </Radio.Button>
                    <Radio.Button value="pronounce" style={{ borderRadius: '0 12px 12px 0', fontWeight: 600 }}>
                        <AudioOutlined /> 4. Luyện phát âm
                    </Radio.Button>
                </Radio.Group>
            </div>

            {/* ================= MODE 1: LẬT THẺ KINH ĐIỂN SM-2 ================= */}
            {mode === 'flip' && currentCard && (
                <div>
                    {/* Flashcard Box with 3D Flip Animation */}
                    <div
                        onClick={() => setIsFlipped(!isFlipped)}
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
                                            playAudio(currentCard.word, currentCard.audioUrl);
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
                                        <div style={{ background: '#f8fafc', borderRadius: 14, padding: '16px 20px', maxWidth: 600, margin: '0 auto 16px', textAlign: 'left', borderLeft: '4px solid #2563eb' }}>
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
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, 1fr)',
                            gap: 16,
                            maxWidth: 680,
                            margin: '0 auto',
                        }}>
                            <Button
                                size="large"
                                onClick={() => handleRate(1)}
                                style={{
                                    height: 58,
                                    borderRadius: 14,
                                    borderColor: '#ef4444',
                                    color: '#dc2626',
                                    background: '#fef2f2',
                                    fontWeight: 700
                                }}
                            >
                                ❌ Khó (1)<br />
                                <span style={{ fontSize: '0.75rem', fontWeight: 400 }}>Lặp lại sau 1 ngày</span>
                            </Button>
                            <Button
                                size="large"
                                onClick={() => handleRate(2)}
                                style={{
                                    height: 58,
                                    borderRadius: 14,
                                    borderColor: '#3b82f6',
                                    color: '#2563eb',
                                    background: '#eff6ff',
                                    fontWeight: 700
                                }}
                            >
                                ⚡ Trung bình (2)<br />
                                <span style={{ fontSize: '0.75rem', fontWeight: 400 }}>Lặp lại sau 3 ngày</span>
                            </Button>
                            <Button
                                size="large"
                                onClick={() => handleRate(3)}
                                style={{
                                    height: 58,
                                    borderRadius: 14,
                                    borderColor: '#10b981',
                                    color: '#16a34a',
                                    background: '#f0fdf4',
                                    fontWeight: 700
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
                                onClick={() => setIsFlipped(true)}
                                style={{ height: 48, borderRadius: 12, fontWeight: 700, minWidth: 200 }}
                            >
                                Lật thẻ xem nghĩa (Space)
                            </Button>
                        </div>
                    )}
                </div>
            )}

            {/* ================= MODE 2: LUYỆN VIẾT CÂU CÓ AI CHẤM ================= */}
            {mode === 'sentence' && currentCard && (
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
                            onChange={(e) => setUserSentence(e.target.value)}
                            placeholder={`Ví dụ: In modern society, ${currentCard.word}...`}
                            style={{ borderRadius: 12, marginTop: 8, fontSize: '1rem', padding: 12 }}
                            onPressEnter={(e) => {
                                if (e.ctrlKey) handleCheckSentence();
                            }}
                        />
                    </div>



                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Button onClick={() => playAudio(currentCard.exampleSentence || currentCard.word)}>
                            Xem gợi ý câu mẫu
                        </Button>
                        <Button
                            type="primary"
                            size="large"
                            icon={<BulbOutlined />}
                            loading={isCheckingSentence}
                            onClick={handleCheckSentence}
                            style={{ borderRadius: 12, fontWeight: 700 }}
                        >
                            Chấm câu bằng AI
                        </Button>
                    </div>

                    {/* AI Feedback Result */}
                    {sentenceFeedback && (
                        <div style={{ marginTop: 24, padding: 20, borderRadius: 16, background: sentenceFeedback.isCorrect ? '#f0fdf4' : '#fff7ed', border: `1px solid ${sentenceFeedback.isCorrect ? '#86efac' : '#fdba74'}` }}>
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
                                <Tag color={sentenceFeedback.score >= 8 ? 'green' : 'orange'} style={{ fontSize: '0.9rem', padding: '4px 12px', borderRadius: 999, fontWeight: 700 }}>
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
                                <div style={{
                                    background: '#ffffff',
                                    borderRadius: 12,
                                    padding: '14px 18px',
                                    border: sentenceFeedback.isCorrect ? '1.5px solid #86efac' : '1.5px solid #38bdf8',
                                    marginBottom: 16,
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                        <Text style={{ fontSize: '0.85rem', color: '#0369a1', fontWeight: 700 }}>
                                            ✍️ {sentenceFeedback.isCorrect ? 'Câu của bạn (Đã chuẩn ngữ pháp):' : 'Câu sửa đúng chuẩn (từ câu của bạn):'}
                                        </Text>
                                        <Button
                                            type="text"
                                            size="small"
                                            icon={<SoundOutlined />}
                                            onClick={() => playAudio(sentenceFeedback.correctedSentence!)}
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
                                                        boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
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
                                                                margin: 0
                                                            }}
                                                        >
                                                            {ex.levelLabel || ex.level}
                                                        </Tag>
                                                        <Button
                                                            type="text"
                                                            size="small"
                                                            icon={<SoundOutlined />}
                                                            onClick={() => playAudio(ex.sentence)}
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
                                        onClick={() => playAudio(sentenceFeedback.improvedSentenceBand8)}
                                        style={{ marginLeft: 8 }}
                                    />
                                </div>
                            )}

                            <div style={{ marginTop: 16, textAlign: 'right' }}>
                                <Button
                                    type="primary"
                                    onClick={() => {
                                        if (currentIndex + 1 < cards.length) {
                                            setCurrentIndex((i) => i + 1);
                                        }
                                    }}
                                >
                                    Từ tiếp theo →
                                </Button>
                            </div>
                        </div>
                    )}
                </Card>
            )}

            {/* ================= MODE 3: TRẮC NGHIỆM PHẢN XẠ NHANH ================= */}
            {mode === 'quiz' && currentCard && (
                <Card style={{ borderRadius: 24, padding: '28px 24px', textAlign: 'center', boxShadow: '0 12px 36px rgba(0,0,0,0.05)' }}>
                    {currentCard.imageUrl && (
                        <img
                            src={currentCard.imageUrl}
                            alt={currentCard.word}
                            style={{ width: '100%', maxWidth: 460, height: 210, borderRadius: 16, objectFit: 'cover', margin: '0 auto 18px', display: 'block', boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}
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
                            let type: 'default' | 'primary' = 'default';

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
                                    type={type}
                                    onClick={() => handleSelectQuizAnswer(opt)}
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
                            onClick={() => {
                                if (currentIndex + 1 < cards.length) {
                                    setCurrentIndex((i) => i + 1);
                                }
                            }}
                            style={{ marginTop: 24, borderRadius: 12 }}
                        >
                            Câu hỏi tiếp theo →
                        </Button>
                    )}
                </Card>
            )}

            {/* ================= MODE 4: LUYỆN PHÁT ÂM QUA MICRO ================= */}
            {mode === 'pronounce' && currentCard && (
                <Card style={{ borderRadius: 24, padding: '36px 24px', textAlign: 'center', boxShadow: '0 12px 36px rgba(0,0,0,0.05)' }}>
                    <Title level={1} style={{ color: '#0f172a', fontWeight: 800, margin: '0 0 8px' }}>
                        {currentCard.word}
                    </Title>
                    <Text style={{ fontSize: '1.25rem', color: '#2563eb', fontStyle: 'italic', display: 'block', marginBottom: 16 }}>
                        {currentCard.phonetic}
                    </Text>

                    <Button
                        shape="round"
                        icon={<SoundOutlined />}
                        onClick={() => playAudio(currentCard.word)}
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
                            onClick={handleStartSpeech}
                            style={{
                                width: 90,
                                height: 90,
                                fontSize: 36,
                                background: isListeningSpeech ? '#ef4444' : '#2563eb',
                                borderColor: isListeningSpeech ? '#ef4444' : '#2563eb',
                                boxShadow: isListeningSpeech ? '0 0 24px rgba(239,68,68,0.5)' : '0 8px 24px rgba(37,99,235,0.3)'
                            }}
                        />
                        <div style={{ marginTop: 12, color: isListeningSpeech ? '#dc2626' : '#64748b', fontWeight: 600 }}>
                            {isListeningSpeech ? 'Đang lắng nghe bạn đọc...' : 'Bấm vào Micro và đọc to từ này'}
                        </div>
                    </div>

                    {spokenResult && (
                        <div style={{ maxWidth: 450, margin: '24px auto 0', padding: 16, borderRadius: 16, background: spokenResult.isCorrect ? '#f0fdf4' : '#fff7ed', border: `1px solid ${spokenResult.isCorrect ? '#86efac' : '#fdba74'}` }}>
                            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: spokenResult.isCorrect ? '#16a34a' : '#ea580c', marginBottom: 6 }}>
                                {spokenResult.isCorrect ? '🎉 Phát âm chính xác!' : 'Chưa khớp lắm, hãy thử lại!'}
                            </div>
                            <div style={{ color: '#475569', fontSize: '0.9rem' }}>
                                Bạn đã đọc: <strong>"{spokenResult.text}"</strong>
                            </div>

                            <Button
                                type="primary"
                                style={{ marginTop: 12 }}
                                onClick={() => {
                                    if (currentIndex + 1 < cards.length) {
                                        setCurrentIndex((i) => i + 1);
                                    }
                                }}
                            >
                                Từ tiếp theo →
                            </Button>
                        </div>
                    )}
                </Card>
            )}
        </div>
    );
};
