import React, { useState, useEffect, useMemo } from 'react';
import {
    Card,
    Button,
    Radio,
    Progress,
    message,
    Empty,
} from 'antd';
import {
    ArrowLeftOutlined,
    RetweetOutlined,
    EditOutlined,
    AudioOutlined,
    QuestionCircleOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { PageLoadingState, PageErrorState } from '@/components';
import { useQueryClient } from '@tanstack/react-query';
import {
    useFlashcardDeckDetailQuery,
    useStudyCardsQuery,
    flashcardKeys,
} from '../hooks/useFlashcardQueries';
import { flashcardService as flashcardApi } from '../services/flashcard.service';
import type { FlashcardItemDto, AiCheckSentenceResponse } from '../types/flashcard.types';
import { playFlashcardAudio as playAudio } from '../utils/flashcard.utils';
import { FlashcardCompletedCard } from '../components/study/FlashcardCompletedCard';
import { FlashcardFlipMode } from '../components/study/FlashcardFlipMode';
import { FlashcardSentenceMode } from '../components/study/FlashcardSentenceMode';
import { FlashcardQuizMode } from '../components/study/FlashcardQuizMode';
import { FlashcardPronounceMode } from '../components/study/FlashcardPronounceMode';

type StudyMode = 'flip' | 'sentence' | 'quiz' | 'pronounce';

export const FlashcardStudyPage: React.FC = () => {
    const { deckId = '' } = useParams<{ deckId: string }>();
    const [searchParams] = useSearchParams();
    const targetCardId = searchParams.get('cardId');
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const { data: deck } = useFlashcardDeckDetailQuery(deckId);
    const { data: cards = [], isLoading, isError, refetch } = useStudyCardsQuery(deckId, false);

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
                userSentence.trim(),
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

        const cardDistractors = currentCard.quizDistractors
            ? currentCard.quizDistractors
                .split('|')
                .map((d) => d.trim())
                .filter((d) => d.length > 0 && d !== correct)
            : [];

        const otherFromDeck = cards
            .filter((c) => c.id !== currentCard.id && c.meaningVi && c.meaningVi.trim() !== correct)
            .map((c) => c.meaningVi.trim());

        const distractors = Array.from(new Set([...cardDistractors, ...otherFromDeck])).slice(0, 5);

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

    const handleNextCard = () => {
        if (currentIndex + 1 < cards.length) {
            setCurrentIndex((i) => i + 1);
        }
    };

    if (isLoading) {
        return <PageLoadingState type="spin" tip="Đang nạp dữ liệu thẻ ôn tập..." />;
    }

    if (isError) {
        return (
            <div style={{ maxWidth: 600, margin: '60px auto' }}>
                <PageErrorState
                    title="Không thể tải danh sách thẻ ôn tập"
                    onRetry={() => refetch()}
                    backUrl={`/app/flashcards/${deckId}`}
                    backText="Quay về bộ thẻ"
                />
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
            <FlashcardCompletedCard
                completedCount={completedCount}
                totalCards={cards.length}
                onRestart={() => {
                    setCurrentIndex(0);
                    setCompletedCount(0);
                }}
                onBackToDeck={() => navigate(`/app/flashcards/${deckId}`)}
            />
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
                percent={Math.round((currentIndex / cards.length) * 100)}
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

            {mode === 'flip' && currentCard && (
                <FlashcardFlipMode
                    currentCard={currentCard}
                    isFlipped={isFlipped}
                    onToggleFlip={() => setIsFlipped(!isFlipped)}
                    onRate={handleRate}
                    onPlayAudio={playAudio}
                />
            )}

            {mode === 'sentence' && currentCard && (
                <FlashcardSentenceMode
                    currentCard={currentCard}
                    userSentence={userSentence}
                    isCheckingSentence={isCheckingSentence}
                    sentenceFeedback={sentenceFeedback}
                    onChangeSentence={setUserSentence}
                    onCheckSentence={handleCheckSentence}
                    onNextCard={handleNextCard}
                    onPlayAudio={playAudio}
                />
            )}

            {mode === 'quiz' && currentCard && (
                <FlashcardQuizMode
                    currentCard={currentCard}
                    quizOptions={quizOptions}
                    selectedQuizAnswer={selectedQuizAnswer}
                    isQuizAnswered={isQuizAnswered}
                    onSelectAnswer={handleSelectQuizAnswer}
                    onNextCard={handleNextCard}
                />
            )}

            {mode === 'pronounce' && currentCard && (
                <FlashcardPronounceMode
                    currentCard={currentCard}
                    isListeningSpeech={isListeningSpeech}
                    spokenResult={spokenResult}
                    onStartSpeech={handleStartSpeech}
                    onPlayAudio={playAudio}
                    onNextCard={handleNextCard}
                />
            )}
        </div>
    );
};
