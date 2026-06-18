import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    Alert,
    Button,
    Card,
    Col,
    Empty,
    Input,
    Row,
    Space,
    Statistic,
    Tag,
    Typography,
    message,
} from 'antd';
import {
    ArrowLeftOutlined,
    ArrowRightOutlined,
    AudioOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    LoadingOutlined,
    PauseCircleOutlined,
    PlayCircleOutlined,
    SendOutlined,
    SoundOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { usePracticeSessionQuery, useUpdatePracticeSessionAnswersMutation, useUploadPracticeSpeakingRecordingMutation } from '../api/session.api';
import { getSkillLabel, isSpeakingSkill } from '../lib/sessionRouting';
import type { PracticeSessionDto, PracticeSessionSpeakingAnalyticsDto, PracticeSessionSpeakingQuestionDto } from '../types/session.types';
import { SpeakingAvatarCanvas } from '../components/speaking/SpeakingAvatarCanvas';
import { useSpeakingRecorder } from '../hooks/useSpeakingRecorder';
import { useSpeakingPromptPlayback } from '../hooks/useSpeakingPromptPlayback';
import type { SpeakingVisemeCue } from '../lib/speakingPlayback';
import { uploadToCloudinary } from '@/shared/lib/cloudinary';

const { Paragraph, Text, Title } = Typography;
const { TextArea } = Input;

type SpeakingPromptEntry = {
    sectionTitle: string | null;
    partId: string;
    partNumber: number | null;
    partDescription: string | null;
    question: PracticeSessionSpeakingQuestionDto;
    promptIndex: number;
    globalIndex: number;
};

const normalizeCueCardPoints = (value?: string | null) => (
    (value ?? '')
        .split(/\r?\n|•/g)
        .map((item) => item.replace(/^[\s\-–•]+/, '').trim())
        .filter(Boolean)
);

const formatSeconds = (value?: number | null) => {
    if (value == null) {
        return 'Không giới hạn';
    }

    const total = Math.max(0, value);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const getRecordingLimitSeconds = (partNumber?: number | null) => {
    if (partNumber === 2) {
        return 120;
    }

    if (partNumber === 1) {
        return 45;
    }

    return 90;
};

const hasPreparationStep = (entry?: SpeakingPromptEntry | null) => entry?.partNumber === 2 && entry?.promptIndex === 1;

const getPreparationLimitSeconds = (entry?: SpeakingPromptEntry | null) => (hasPreparationStep(entry) ? 60 : 0);

const speakingPaceLabelMap: Record<NonNullable<PracticeSessionSpeakingAnalyticsDto['paceLabel']>, string> = {
    insufficient_data: 'Chưa đủ dữ liệu pace',
    slow: 'Pace chậm',
    balanced: 'Pace cân bằng',
    fast: 'Pace nhanh',
    very_fast: 'Pace quá nhanh',
};

const speakingCoverageLabelMap: Record<NonNullable<PracticeSessionSpeakingAnalyticsDto['coverageLabel']>, string> = {
    insufficient_data: 'Chưa đủ dữ liệu độ dài',
    too_short: 'Câu trả lời quá ngắn',
    on_target: 'Độ dài đạt mục tiêu',
    exceeds_target: 'Thời lượng vượt mục tiêu',
};

const getAnalyticsTagColor = (label?: string | null) => {
    switch (label) {
        case 'balanced':
        case 'on_target':
            return 'success';
        case 'fast':
            return 'processing';
        case 'slow':
        case 'too_short':
        case 'very_fast':
        case 'exceeds_target':
            return 'warning';
        default:
            return 'default';
    }
};

const getSpeakingPromptEntries = (session?: PracticeSessionDto | null): SpeakingPromptEntry[] => {
    if (!session) {
        return [];
    }

    let globalIndex = 0;
    return session.exam.sections.flatMap((section) =>
        section.speakingParts.flatMap((part) =>
            [...part.questions]
                .sort((left, right) => (left.orderIndex ?? 0) - (right.orderIndex ?? 0))
                .map((question, index) => {
                    globalIndex += 1;
                    return {
                        sectionTitle: section.title,
                        partId: part.id,
                        partNumber: part.partNumber,
                        partDescription: part.description,
                        question,
                        promptIndex: index + 1,
                        globalIndex,
                    };
                }),
        ),
    );
};

const buildSpeakingAnswerMap = (session?: PracticeSessionDto | null) =>
    new Map(
        (session?.answers ?? [])
            .filter((answer) => !!answer.speakingQuestionId)
            .map((answer) => [answer.speakingQuestionId!, answer]),
    );

const getNextPromptQuestionId = (entries: SpeakingPromptEntry[], questionId: string) => {
    const currentPromptIndex = entries.findIndex((entry) => entry.question.id === questionId);
    return currentPromptIndex >= 0 ? entries[currentPromptIndex + 1]?.question.id ?? null : null;
};

const TRANSITION_PHRASES = [
    "Thank you. Let's move on to the next question.",
    "Alright. Now, let's proceed to the next prompt.",
    "Thank you. Let's head over to the next part of our discussion.",
    "Okay, I see. Now, let's talk about the next topic.",
    "Great. Let's advance to the next question, please."
];

const FINAL_PHRASES = [
    "Thank you. That is the end of the speaking test.",
    "Alright, that concludes your speaking session. Thank you.",
    "Thank you very much. We have finished the speaking exam."
];

export const ClientSpeakingSessionPage = () => {
    const navigate = useNavigate();
    const { sessionId = '' } = useParams();
    const { data: session, isLoading, isError } = usePracticeSessionQuery(sessionId);
    const updateAnswersMutation = useUpdatePracticeSessionAnswersMutation();
    const uploadSpeakingRecordingMutation = useUploadPracticeSpeakingRecordingMutation();
    const {
        permissionState,
        audioLevel,
        isRecording,
        elapsedSeconds,
        lastRecording,
        errorMessage: recorderErrorMessage,
        requestPermission,
        startRecording,
        stopRecording,
    } = useSpeakingRecorder();
    const {
        activeQuestionId: promptPlaybackQuestionId,
        isPreparing: isPreparingPromptPlayback,
        isPlaying: isPromptPlaying,
        playbackMode: promptPlaybackMode,
        audioLevel: promptAudioLevel,
        activeViseme,
        playPrompt,
        stopPlayback: stopPromptPlayback,
    } = useSpeakingPromptPlayback();

    const promptEntries = useMemo(() => getSpeakingPromptEntries(session), [session]);
    const answerMap = useMemo(() => buildSpeakingAnswerMap(session), [session]);
    const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
    const [cueCardDrafts, setCueCardDrafts] = useState<Record<string, string>>({});
    const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [nextBlinkerVisible, setNextBlinkerVisible] = useState(false);
    const [transitionText, setTransitionText] = useState<string | null>(null);
    const [isNextRunning, setIsNextRunning] = useState(false);
    const isNextRunningRef = useRef(false);
    const stopPromptPlaybackRef = useRef(stopPromptPlayback);
    const stopRecordingRef = useRef(stopRecording);

    useEffect(() => {
        stopPromptPlaybackRef.current = stopPromptPlayback;
        stopRecordingRef.current = stopRecording;
    }, [stopPromptPlayback, stopRecording]);

    const lastActiveTimeRef = useRef<number>(0);
    const nextTimeoutRef = useRef<number | null>(null);
    const [prepStartedAtByQuestionId, setPrepStartedAtByQuestionId] = useState<Record<string, number>>({});
    const [clockNow, setClockNow] = useState(() => Date.now());
    const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
    const [queuedAutoRecordingQuestionId, setQueuedAutoRecordingQuestionId] = useState<string | null>(null);
    const [uploadingQuestionIds, setUploadingQuestionIds] = useState<string[]>([]);
    const [localDurationByQuestionId, setLocalDurationByQuestionId] = useState<Record<string, number>>({});
    const [localTranscriptByQuestionId, setLocalTranscriptByQuestionId] = useState<Record<string, string>>({});
    const [localSpeakingAnalyticsByQuestionId, setLocalSpeakingAnalyticsByQuestionId] = useState<Record<string, PracticeSessionSpeakingAnalyticsDto | null>>({});
    const lastPersistedTimeRef = useRef<number | null>(null);
    const recordingTargetQuestionIdRef = useRef<string | null>(null);
    const activeSessionIdRef = useRef(sessionId);
    const promptEntriesRef = useRef<SpeakingPromptEntry[]>(promptEntries);
    const lastHandledRecordingKeyRef = useRef<string | null>(null);
    const isMountedRef = useRef(true);

    useEffect(() => {
        activeSessionIdRef.current = sessionId;
    }, [sessionId]);

    useEffect(() => {
        setHeaderSlot(document.getElementById('client-page-header-slot'));
    }, []);

    useEffect(() => {
        promptEntriesRef.current = promptEntries;
    }, [promptEntries]);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        if (!isRecording) {
            lastActiveTimeRef.current = 0;
            return;
        }

        if (lastActiveTimeRef.current === 0) {
            lastActiveTimeRef.current = Date.now();
        }

        const threshold = 0.025;
        const silenceTimeout = 5000;

        if (audioLevel >= threshold) {
            lastActiveTimeRef.current = Date.now();
        } else {
            const elapsed = Date.now() - lastActiveTimeRef.current;
            if (elapsed >= silenceTimeout) {
                void stopRecording();
                message.info('Đã tự động dừng ghi âm do không phát hiện giọng nói trong 5 giây.');
            }
        }
    }, [audioLevel, isRecording, stopRecording]);

    const updateRecordingTargetQuestionId = useCallback((questionId: string | null) => {
        recordingTargetQuestionIdRef.current = questionId;
    }, []);

    const markQuestionUploading = useCallback((questionId: string) => {
        setUploadingQuestionIds((current) => (
            current.includes(questionId) ? current : [...current, questionId]
        ));
    }, []);

    const unmarkQuestionUploading = useCallback((questionId: string) => {
        setUploadingQuestionIds((current) => current.filter((currentId) => currentId !== questionId));
    }, []);

    const hasResolvedTranscriptOrAnalytics = useCallback((questionId: string) => {
        const savedAnswer = answerMap.get(questionId);

        return (
            !!localTranscriptByQuestionId[questionId]?.trim()
            || !!savedAnswer?.transcriptText?.trim()
            || localSpeakingAnalyticsByQuestionId[questionId] != null
            || savedAnswer?.speakingAnalytics != null
        );
    }, [answerMap, localSpeakingAnalyticsByQuestionId, localTranscriptByQuestionId]);

    const hasPromptResponse = useCallback((questionId: string) => {
        const savedAnswer = answerMap.get(questionId);

        return (
            hasResolvedTranscriptOrAnalytics(questionId)
            || !!savedAnswer?.answerText?.trim()
            || !!savedAnswer?.audioUrl
            || (savedAnswer?.durationSeconds ?? 0) > 0
            || (localDurationByQuestionId[questionId] ?? 0) > 0
        );
    }, [answerMap, hasResolvedTranscriptOrAnalytics, localDurationByQuestionId]);

    useEffect(() => {
        if (uploadingQuestionIds.length === 0) {
            return;
        }

        const resolvedQuestionIds = uploadingQuestionIds.filter((questionId) => hasResolvedTranscriptOrAnalytics(questionId));

        if (resolvedQuestionIds.length === 0) {
            return;
        }

        setUploadingQuestionIds((current) => current.filter((questionId) => !resolvedQuestionIds.includes(questionId)));
    }, [hasResolvedTranscriptOrAnalytics, uploadingQuestionIds]);

    const lockedPart2QuestionIds = useMemo(() => {
        const lockedQuestionIds = new Set<string>();
        const part2EntriesByPartId = new Map<string, SpeakingPromptEntry[]>();

        promptEntries
            .filter((entry) => entry.partNumber === 2)
            .forEach((entry) => {
                const currentEntries = part2EntriesByPartId.get(entry.partId) ?? [];
                currentEntries.push(entry);
                part2EntriesByPartId.set(entry.partId, currentEntries);
            });

        part2EntriesByPartId.forEach((entries) => {
            let previousPromptAnswered = true;

            entries.forEach((entry) => {
                if (!previousPromptAnswered) {
                    lockedQuestionIds.add(entry.question.id);
                    return;
                }

                previousPromptAnswered = hasPromptResponse(entry.question.id);
            });
        });

        return lockedQuestionIds;
    }, [hasPromptResponse, promptEntries]);

    const activePrompt = useMemo(
        () => promptEntries.find((entry) => entry.question.id === selectedQuestionId) ?? promptEntries[0] ?? null,
        [promptEntries, selectedQuestionId],
    );

    const activeQuestionId = activePrompt?.question.id ?? '';
    const activeSavedAnswer = activePrompt ? answerMap.get(activePrompt.question.id) : null;
    const recordingLimitSeconds = getRecordingLimitSeconds(activePrompt?.partNumber);
    const preparationLimitSeconds = getPreparationLimitSeconds(activePrompt);
    const hasPreparationStarted = !!(activeQuestionId && prepStartedAtByQuestionId[activeQuestionId]);

    const preparationRemainingSeconds = useMemo(() => {
        if (!activePrompt || preparationLimitSeconds <= 0) {
            return 0;
        }

        const startedAt = prepStartedAtByQuestionId[activePrompt.question.id];
        if (!startedAt) {
            return preparationLimitSeconds;
        }

        const elapsed = Math.floor((clockNow - startedAt) / 1000);
        return Math.max(0, preparationLimitSeconds - elapsed);
    }, [activePrompt, clockNow, prepStartedAtByQuestionId, preparationLimitSeconds]);

    const systemCheckReady = permissionState === 'granted';

    useEffect(() => {
        if (!session) {
            return;
        }

        setTimeRemaining(session.timeRemaining ?? null);
        lastPersistedTimeRef.current = session.timeRemaining ?? null;
        setSelectedQuestionId((current) => {
            if (current && promptEntries.some((entry) => entry.question.id === current)) {
                return current;
            }
            const firstUnanswered = promptEntries.find((entry) => !hasPromptResponse(entry.question.id));
            return firstUnanswered?.question.id ?? promptEntries[0]?.question.id ?? null;
        });
    }, [session, promptEntries, hasPromptResponse]);

    useEffect(() => {
        setPrepStartedAtByQuestionId({});
        setCueCardDrafts({});
        updateRecordingTargetQuestionId(null);
        setQueuedAutoRecordingQuestionId(null);
        setUploadingQuestionIds([]);
        setLocalDurationByQuestionId({});
        setLocalTranscriptByQuestionId({});
        setLocalSpeakingAnalyticsByQuestionId({});
    }, [session?.sessionId, updateRecordingTargetQuestionId]);

    useEffect(() => {
        if (!selectedQuestionId || !lockedPart2QuestionIds.has(selectedQuestionId)) {
            return;
        }

        const currentEntry = promptEntries.find((entry) => entry.question.id === selectedQuestionId);
        if (!currentEntry) {
            return;
        }

        const fallbackEntry = promptEntries.find((entry) => (
            entry.partId === currentEntry.partId
            && !lockedPart2QuestionIds.has(entry.question.id)
        )) ?? promptEntries[0] ?? null;

        if (fallbackEntry && fallbackEntry.question.id !== selectedQuestionId) {
            setSelectedQuestionId(fallbackEntry.question.id);
        }
    }, [lockedPart2QuestionIds, promptEntries, selectedQuestionId]);

    useEffect(() => {
        const interval = window.setInterval(() => setClockNow(Date.now()), 1000);
        return () => window.clearInterval(interval);
    }, []);

    useEffect(() => {
        void requestPermission().catch(() => undefined);
    }, [requestPermission]);

    useEffect(() => {
        if (session?.status !== 'InProgress' || timeRemaining == null) {
            return;
        }

        const interval = window.setInterval(() => {
            setTimeRemaining((current) => (current == null ? null : Math.max(0, current - 1)));
        }, 1000);

        return () => window.clearInterval(interval);
    }, [session?.status, session?.sessionId, timeRemaining]);

    useEffect(() => {
        if (!sessionId || timeRemaining == null || session?.status !== 'InProgress') {
            return;
        }

        if (lastPersistedTimeRef.current == null) {
            lastPersistedTimeRef.current = timeRemaining;
            return;
        }

        if (Math.abs(lastPersistedTimeRef.current - timeRemaining) < 15 && timeRemaining !== 0) {
            return;
        }

        lastPersistedTimeRef.current = timeRemaining;
        updateAnswersMutation.mutate({
            sessionId,
            data: {
                timeRemaining,
                answers: [],
            },
        });
    }, [session?.status, sessionId, timeRemaining, updateAnswersMutation]);

    useEffect(() => {
        if (session?.status === 'InProgress' && timeRemaining === 0) {
            navigate(`/app/sessions/${sessionId}/submit?auto=1`, { replace: true });
        }
    }, [navigate, session?.status, sessionId, timeRemaining]);

    useEffect(() => {
        if (!lastRecording || !sessionId) {
            return;
        }

        const questionId = recordingTargetQuestionIdRef.current;
        if (!questionId) {
            return;
        }

        const recordingKey = lastRecording.previewUrl;
        if (lastHandledRecordingKeyRef.current === recordingKey) {
            return;
        }

        lastHandledRecordingKeyRef.current = recordingKey;
        const uploadSessionId = sessionId;
        updateRecordingTargetQuestionId(null);
        markQuestionUploading(questionId);
        setLocalDurationByQuestionId((current) => ({
            ...current,
            [questionId]: lastRecording.durationSeconds,
        }));
        const nextPromptQuestionId = getNextPromptQuestionId(promptEntriesRef.current, questionId);

        setIsTransitioning(true);
        setNextBlinkerVisible(false);
        const isLastQuestion = !nextPromptQuestionId;
        const phrases = isLastQuestion ? FINAL_PHRASES : TRANSITION_PHRASES;
        const randomPhrase = phrases[Math.floor(Math.random() * phrases.length)];
        setTransitionText(randomPhrase);

        void playPrompt({
            questionId: 'transition',
            text: randomPhrase,
            visemeTimeline: null,
            onEnd: () => {
                setNextBlinkerVisible(true);
            },
        });

        const persistRecording = async () => {
            try {
                const file = new File(
                    [lastRecording.blob],
                    `speaking-${uploadSessionId}-${questionId}-${Date.now()}.webm`,
                    { type: lastRecording.mimeType || 'audio/webm' },
                );
                const audioUrl = await uploadToCloudinary(file, 'video');
                const fileSizeKB = Math.round(file.size / 1024);

                const result = await uploadSpeakingRecordingMutation.mutateAsync({
                    sessionId: uploadSessionId,
                    data: {
                        speakingQuestionId: questionId,
                        durationSeconds: lastRecording.durationSeconds,
                        audioUrl,
                        fileSizeKB,
                    },
                });
                if (!isMountedRef.current || activeSessionIdRef.current !== uploadSessionId) {
                    return;
                }

                setLocalTranscriptByQuestionId((current) => ({
                    ...current,
                    [questionId]: result.transcriptText ?? '',
                }));
                setLocalSpeakingAnalyticsByQuestionId((current) => ({
                    ...current,
                    [questionId]: result.speakingAnalytics,
                }));

                message.success('Đã lưu bản ghi Speaking.');
            } catch (error: any) {
                if (isMountedRef.current && activeSessionIdRef.current === uploadSessionId) {
                    message.error(error?.message || 'Upload audio thất bại. Kiểm tra mạng rồi ghi lại hoặc thử lưu lại.');
                }
            } finally {
                if (isMountedRef.current && activeSessionIdRef.current === uploadSessionId) {
                    unmarkQuestionUploading(questionId);
                }
            }
        };

        void persistRecording();
    }, [lastRecording, markQuestionUploading, sessionId, unmarkQuestionUploading, updateRecordingTargetQuestionId, uploadSpeakingRecordingMutation, playPrompt]);

    useEffect(() => () => {
        stopPromptPlaybackRef.current();
        void stopRecordingRef.current().catch(() => undefined);
        if (nextTimeoutRef.current != null) {
            window.clearTimeout(nextTimeoutRef.current);
        }
        isNextRunningRef.current = false;
    }, []);

    useEffect(() => {
        if (
            !activeQuestionId
            || !promptPlaybackQuestionId
            || promptPlaybackQuestionId === activeQuestionId
            || promptPlaybackQuestionId === 'transition'
        ) {
            return;
        }

        stopPromptPlayback();
    }, [activeQuestionId, promptPlaybackQuestionId, stopPromptPlayback]);

    const handlePlayPrompt = useCallback(async (entry: SpeakingPromptEntry) => {
        const promptTimeline: SpeakingVisemeCue[] | null = entry.question.promptVisemeTimeline?.map((cue) => ({
            code: cue.code as SpeakingVisemeCue['code'],
            startMs: cue.startMs,
            endMs: cue.endMs,
        })) ?? null;

        await playPrompt({
            questionId: entry.question.id,
            text: entry.question.content,
            visemeTimeline: promptTimeline,
            estimatedDurationMs: entry.question.promptEstimatedDurationMs,
        });
    }, [playPrompt]);

    const handleReplayPrompt = useCallback(async (entry: SpeakingPromptEntry) => {
        setQueuedAutoRecordingQuestionId(null);
        try {
            await handlePlayPrompt(entry);
        } catch (error: any) {
            message.error(error?.message || 'Không thể phát prompt của giám khảo.');
        }
    }, [handlePlayPrompt]);

    const handleBeginResponseTurn = useCallback(async () => {
        if (!activePrompt) {
            return;
        }

        if (preparationLimitSeconds > 0 && !hasPreparationStarted) {
            setQueuedAutoRecordingQuestionId(activePrompt.question.id);
            try {
                await handlePlayPrompt(activePrompt);
            } catch (error: any) {
                setQueuedAutoRecordingQuestionId(null);
                message.error(error?.message || 'Không thể phát prompt của giám khảo.');
            }
            return;
        }

        if (preparationLimitSeconds > 0 && preparationRemainingSeconds > 0) {
            message.info(`Part 2 còn ${preparationRemainingSeconds}s chuẩn bị. Hết prep rồi mới bắt đầu ghi âm.`);
            return;
        }

        if (preparationLimitSeconds <= 0) {
            setQueuedAutoRecordingQuestionId(activePrompt.question.id);
            try {
                await handlePlayPrompt(activePrompt);
            } catch (error: any) {
                setQueuedAutoRecordingQuestionId(null);
                message.error(error?.message || 'Không thể phát prompt của giám khảo.');
            }
            return;
        }

        try {
            updateRecordingTargetQuestionId(activePrompt.question.id);
            await startRecording({ maxDurationSeconds: recordingLimitSeconds });
        } catch (error: any) {
            updateRecordingTargetQuestionId(null);
            message.error(error?.message || recorderErrorMessage || 'Không thể bắt đầu ghi âm.');
        }
    }, [
        activePrompt,
        handlePlayPrompt,
        hasPreparationStarted,
        preparationLimitSeconds,
        preparationRemainingSeconds,
        recorderErrorMessage,
        recordingLimitSeconds,
        startRecording,
        updateRecordingTargetQuestionId,
    ]);

    const handleStopRecording = useCallback(async () => {
        await stopRecording();
    }, [stopRecording]);

    const handleNextTransition = useCallback(() => {
        if (isNextRunningRef.current) {
            return;
        }

        const nextPromptQuestionId = getNextPromptQuestionId(promptEntries, activeQuestionId);
        stopPromptPlayback();

        if (!nextPromptQuestionId) {
            navigate(`/app/sessions/${sessionId}/submit`);
            return;
        }

        isNextRunningRef.current = true;
        setIsNextRunning(true);
        const nextEntry = promptEntries.find((entry) => entry.question.id === nextPromptQuestionId);

        if (nextTimeoutRef.current != null) {
            window.clearTimeout(nextTimeoutRef.current);
        }

        nextTimeoutRef.current = window.setTimeout(async () => {
            if (!isMountedRef.current) {
                return;
            }

            setSelectedQuestionId(nextPromptQuestionId);
            setIsTransitioning(false);
            setNextBlinkerVisible(false);
            setTransitionText(null);
            isNextRunningRef.current = false;
            setIsNextRunning(false);

            if (nextEntry) {
                setQueuedAutoRecordingQuestionId(nextPromptQuestionId);
                try {
                    const promptTimeline = nextEntry.question.promptVisemeTimeline?.map((cue) => ({
                        code: cue.code as SpeakingVisemeCue['code'],
                        startMs: cue.startMs,
                        endMs: cue.endMs,
                    })) ?? null;

                    await playPrompt({
                        questionId: nextEntry.question.id,
                        text: nextEntry.question.content,
                        visemeTimeline: promptTimeline,
                        estimatedDurationMs: nextEntry.question.promptEstimatedDurationMs,
                    });
                } catch (error: any) {
                    setQueuedAutoRecordingQuestionId(null);
                    message.error(error?.message || 'Không thể phát prompt của giám khảo.');
                }
            }

            nextTimeoutRef.current = null;
        }, 3000);
    }, [activeQuestionId, promptEntries, stopPromptPlayback, navigate, sessionId, playPrompt]);

    const handleNextTransitionRef = useRef(handleNextTransition);
    useEffect(() => {
        handleNextTransitionRef.current = handleNextTransition;
    }, [handleNextTransition]);

    useEffect(() => {
        if (!nextBlinkerVisible || !isTransitioning) {
            return;
        }

        handleNextTransitionRef.current();
    }, [nextBlinkerVisible, isTransitioning]);

    useEffect(() => {
        if (
            !queuedAutoRecordingQuestionId
            || !activePrompt
            || queuedAutoRecordingQuestionId !== activePrompt.question.id
            || isRecording
            || isPreparingPromptPlayback
            || (promptPlaybackQuestionId === queuedAutoRecordingQuestionId && isPromptPlaying)
            || uploadingQuestionIds.includes(queuedAutoRecordingQuestionId)
        ) {
            return;
        }

        let cancelled = false;

        const beginRecording = async () => {
            setQueuedAutoRecordingQuestionId(null);

            if (preparationLimitSeconds > 0 && !hasPreparationStarted) {
                setPrepStartedAtByQuestionId((current) => (
                    current[queuedAutoRecordingQuestionId]
                        ? current
                        : { ...current, [queuedAutoRecordingQuestionId]: Date.now() }
                ));
                return;
            }

            try {
                updateRecordingTargetQuestionId(queuedAutoRecordingQuestionId);
                await startRecording({ maxDurationSeconds: recordingLimitSeconds });
            } catch (error: any) {
                if (!cancelled) {
                    updateRecordingTargetQuestionId(null);
                    message.error(error?.message || recorderErrorMessage || 'Không thể bắt đầu ghi âm.');
                }
            }
        };

        void beginRecording();

        return () => {
            cancelled = true;
        };
    }, [
        activePrompt,
        hasPreparationStarted,
        isPreparingPromptPlayback,
        isPromptPlaying,
        isRecording,
        preparationLimitSeconds,
        promptPlaybackQuestionId,
        queuedAutoRecordingQuestionId,
        recorderErrorMessage,
        recordingLimitSeconds,
        startRecording,
        uploadingQuestionIds,
        updateRecordingTargetQuestionId,
    ]);

    if (isLoading) {
        return (
            <Card style={{ borderRadius: 24 }}>
                <Paragraph style={{ margin: 0 }}>Đang tải speaking session...</Paragraph>
            </Card>
        );
    }

    if (isError || !session) {
        return (
            <Card style={{ borderRadius: 24 }}>
                <Empty
                    description="Không tìm thấy speaking session."
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                >
                    <Button type="primary" onClick={() => navigate('/app/my-exams')}>
                        Quay về bài thi của tôi
                    </Button>
                </Empty>
            </Card>
        );
    }

    if (!isSpeakingSkill(session.skillType) || promptEntries.length === 0) {
        return (
            <Card style={{ borderRadius: 24 }}>
                <Empty
                    description="Session này không phải speaking runner hoặc chưa có prompt speaking."
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                >
                    <Button type="primary" onClick={() => navigate('/app/my-exams')}>
                        Quay về bài thi của tôi
                    </Button>
                </Empty>
            </Card>
        );
    }

    const activeCueCardDraft = cueCardDrafts[activePrompt.partId] ?? '';
    const activeCueCardPoints = normalizeCueCardPoints(activePrompt.question.cueCardPoints);
    const activeTranscriptText = localTranscriptByQuestionId[activeQuestionId]
        || activeSavedAnswer?.transcriptText
        || null;
    const activeSpeakingAnalytics = localSpeakingAnalyticsByQuestionId[activeQuestionId]
        ?? activeSavedAnswer?.speakingAnalytics
        ?? null;
    const isUploadingActivePrompt = uploadingQuestionIds.includes(activeQuestionId) && !hasResolvedTranscriptOrAnalytics(activeQuestionId);
    const isExaminerLeadingActivePrompt = queuedAutoRecordingQuestionId === activeQuestionId;
    const isPreparationBlockingRecording = preparationLimitSeconds > 0 && hasPreparationStarted && preparationRemainingSeconds > 0;
    const isPreparationReadyToRecord = preparationLimitSeconds > 0 && hasPreparationStarted && preparationRemainingSeconds === 0;
    const timerText = formatSeconds(timeRemaining);

    return (
        <>
            {headerSlot ? createPortal(
                <div className="speaking-runner-page-toolbar">
                    <Button
                        type="text"
                        className="speaking-runner-back-button"
                        icon={<ArrowLeftOutlined />}
                        aria-label="Quay lại bài thi của tôi"
                        title="Bài thi của tôi"
                        onClick={() => navigate('/app/my-exams')}
                    />
                    <div className="speaking-runner-title-block">
                        <span className="speaking-runner-title-accent" />
                        <div className="speaking-runner-page-title" title={session.examTitle}>
                            {session.examTitle}
                        </div>
                    </div>
                    <div className="speaking-runner-header-meta">
                        <span className="speaking-runner-header-chip speaking-runner-skill-chip">
                            {getSkillLabel(session.skillType)}
                        </span>
                        <span className="speaking-runner-header-chip speaking-runner-part-chip">
                            {`Part ${activePrompt.partNumber ?? '—'}`}
                        </span>
                        <span className="speaking-runner-header-chip">
                            <ClockCircleOutlined />
                            {timerText}
                        </span>
                    </div>
                    <Button
                        type="primary"
                        className="speaking-runner-header-submit"
                        icon={<SendOutlined />}
                        onClick={() => navigate(`/app/sessions/${sessionId}/submit`)}
                    >
                        Xem màn nộp bài
                    </Button>
                </div>,
                headerSlot,
            ) : null}

            <div style={{ width: '100%', padding: '8px 8px 46px' }}>
                <style>{`
                    @keyframes pulseGlow {
                        0% {
                            transform: scale(1);
                            box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.7);
                        }
                        70% {
                            transform: scale(1.03);
                            box-shadow: 0 0 0 10px rgba(37, 99, 235, 0);
                        }
                        100% {
                            transform: scale(1);
                            box-shadow: 0 0 0 0 rgba(37, 99, 235, 0);
                        }
                    }

                    @keyframes pulseGlowSuccess {
                        0% {
                            transform: scale(1);
                            box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
                        }
                        70% {
                            transform: scale(1.03);
                            box-shadow: 0 0 0 10px rgba(16, 185, 129, 0);
                        }
                        100% {
                            transform: scale(1);
                            box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
                        }
                    }

                    .speaking-next-btn-blink {
                        animation: pulseGlow 2s infinite;
                    }

                    .speaking-next-btn-blink-success {
                        animation: pulseGlowSuccess 2s infinite;
                    }

                    @keyframes buttonProgress {
                        from {
                            width: 0%;
                        }
                        to {
                            width: 100%;
                        }
                    }

                    .speaking-next-btn-progress {
                        position: relative;
                        overflow: hidden;
                        pointer-events: none;
                        background: linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #1d4ed8 100%) !important;
                        border: none !important;
                        box-shadow: 0 4px 15px rgba(37, 99, 235, 0.4);
                        transition: all 0.3s ease;
                    }

                    .speaking-next-btn-progress::after {
                        content: '';
                        position: absolute;
                        top: 0;
                        left: 0;
                        height: 100%;
                        background: linear-gradient(90deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.32) 50%, rgba(255, 255, 255, 0.05) 100%);
                        animation: buttonProgress 3s linear forwards;
                        pointer-events: none;
                        z-index: 1;
                    }

                    .speaking-next-btn-progress-success {
                        position: relative;
                        overflow: hidden;
                        pointer-events: none;
                        background: linear-gradient(135deg, #065f46 0%, #10b981 50%, #047857 100%) !important;
                        border: none !important;
                        box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);
                        transition: all 0.3s ease;
                    }

                    .speaking-next-btn-progress-success::after {
                        content: '';
                        position: absolute;
                        top: 0;
                        left: 0;
                        height: 100%;
                        background: linear-gradient(90deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.32) 50%, rgba(255, 255, 255, 0.05) 100%);
                        animation: buttonProgress 3s linear forwards;
                        pointer-events: none;
                        z-index: 1;
                    }

                    .speaking-runner-page-toolbar {
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        width: 100%;
                        min-width: 0;
                        height: 100%;
                    }

                    .speaking-runner-back-button {
                        width: 40px;
                        height: 40px;
                        flex: 0 0 40px;
                        border-radius: 12px;
                        border: 1px solid #bfdbfe;
                        background: linear-gradient(135deg, #ffffff 0%, #eff6ff 100%);
                        color: #0f172a;
                        box-shadow: 0 4px 14px rgba(15, 23, 42, 0.06);
                    }

                    .speaking-runner-back-button:hover {
                        border-color: #93c5fd !important;
                        background: #eff6ff !important;
                        color: #1d4ed8 !important;
                    }

                    .speaking-runner-title-block {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        min-width: 0;
                        flex: 1;
                    }

                    .speaking-runner-title-accent {
                        width: 4px;
                        height: 30px;
                        flex: 0 0 4px;
                        border-radius: 999px;
                        background: linear-gradient(180deg, #2563eb 0%, #0ea5e9 100%);
                        box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.1);
                    }

                    .speaking-runner-page-title {
                        min-width: 0;
                        flex: 1;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                        color: #0f172a;
                        font-weight: 800;
                        font-size: 1.08rem;
                        letter-spacing: -0.02em;
                    }

                    .speaking-runner-header-meta {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        flex-shrink: 0;
                    }

                    .speaking-runner-header-chip {
                        display: inline-flex;
                        align-items: center;
                        gap: 6px;
                        height: 32px;
                        padding: 0 12px;
                        border-radius: 999px;
                        border: 1px solid #dbeafe;
                        background: #ffffff;
                        color: #334155;
                        font-size: 0.85rem;
                        font-weight: 600;
                    }

                    .speaking-runner-skill-chip {
                        border-color: #fecaca;
                        background: #fef2f2;
                        color: #dc2626;
                    }

                    .speaking-runner-part-chip {
                        border-color: #bfdbfe;
                        background: #eff6ff;
                        color: #1d4ed8;
                    }

                    .speaking-runner-header-submit {
                        height: 40px;
                        border-radius: 12px;
                        padding-inline: 16px;
                        flex-shrink: 0;
                    }

                    .speaking-runner-main-grid {
                        align-items: flex-start;
                    }

                    .speaking-runner-sidebar-col {
                        align-self: stretch;
                    }

                    .speaking-runner-sidebar-card {
                        border-radius: 20px;
                    }

                    .speaking-runner-sidebar-card .ant-card-body {
                        display: flex;
                        flex-direction: column;
                        gap: 14px;
                    }

                    .speaking-runner-prompt-list {
                        display: flex;
                        flex-direction: column;
                        gap: 12px;
                        overflow-y: auto;
                        padding-right: 4px;
                    }

                    .speaking-runner-right-stack {
                        width: 100%;
                    }

                    @media (max-width: 1080px) {
                        .speaking-runner-page-toolbar {
                            flex-wrap: wrap;
                            align-items: flex-start;
                            height: auto;
                        }

                        .speaking-runner-title-block {
                            min-width: min(100%, 320px);
                        }

                        .speaking-runner-header-meta {
                            order: 3;
                            width: 100%;
                            flex-wrap: wrap;
                        }

                        .speaking-runner-header-submit {
                            margin-left: auto;
                        }
                    }

                    @media (min-width: 1200px) {
                        .speaking-runner-sidebar-card {
                            position: sticky;
                            top: 12px;
                        }

                        .speaking-runner-prompt-list {
                            max-height: calc(100vh - 320px);
                        }
                    }
                `}</style>

                <Space direction="vertical" size={20} style={{ width: '100%' }}>
                    <Row gutter={[16, 16]} className="speaking-runner-main-grid">
                        <Col xs={24} xl={8} className="speaking-runner-sidebar-col">
                            <Card className="speaking-runner-sidebar-card">
                                <Space direction="vertical" size={14} style={{ width: '100%' }}>
                                    <Title level={5} style={{ margin: 0 }}>
                                        Danh sách prompt
                                    </Title>
                                    <Paragraph style={{ margin: 0, color: '#64748b' }}>
                                        Mỗi lượt trả lời sẽ cho examiner nói trước, sau đó hệ thống tự chuyển sang ghi âm. Riêng Part 2 · Prompt 1 chỉ bắt đầu 60 giây chuẩn bị sau khi examiner đọc xong.
                                    </Paragraph>

                                    <div className="speaking-runner-prompt-list">
                                        {promptEntries.map((entry) => {
                                            const hasResponse = hasPromptResponse(entry.question.id);
                                            const isActive = entry.question.id === activeQuestionId;
                                            const isLocked = lockedPart2QuestionIds.has(entry.question.id);
                                            const isUploading = uploadingQuestionIds.includes(entry.question.id) && !hasResolvedTranscriptOrAnalytics(entry.question.id);

                                            return (
                                                <Button
                                                    key={entry.question.id}
                                                    block
                                                    type={isActive ? 'primary' : 'default'}
                                                    disabled={!isActive || isLocked || isRecording || isPreparingPromptPlayback || isPromptPlaying || !!queuedAutoRecordingQuestionId || isTransitioning}
                                                    onClick={() => setSelectedQuestionId(entry.question.id)}
                                                    style={{
                                                        height: 'auto',
                                                        textAlign: 'left',
                                                        justifyContent: 'flex-start',
                                                        padding: 14,
                                                        borderRadius: 16,
                                                    }}
                                                >
                                                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                                                        <Space wrap>
                                                            <Text strong style={{ color: isActive ? '#fff' : '#0f172a' }}>
                                                                Part {entry.partNumber ?? '—'} · Prompt {entry.promptIndex}
                                                            </Text>
                                                            {isUploading ? (
                                                                <Tag icon={<LoadingOutlined />} color="processing">
                                                                    Uploading
                                                                </Tag>
                                                            ) : isLocked ? (
                                                                <Tag color="default">
                                                                    Chờ prompt trước
                                                                </Tag>
                                                            ) : hasResponse ? (
                                                                <Tag icon={<CheckCircleOutlined />} color="success">
                                                                    Đã có phản hồi
                                                                </Tag>
                                                            ) : (
                                                                <Tag>Chưa trả lời</Tag>
                                                            )}
                                                        </Space>
                                                        <Text
                                                            style={{
                                                                color: isActive ? 'rgba(255,255,255,0.88)' : '#475569',
                                                                whiteSpace: 'normal',
                                                            }}
                                                        >
                                                            {entry.question.content}
                                                        </Text>
                                                    </Space>
                                                </Button>
                                            );
                                        })}
                                    </div>
                                </Space>
                            </Card>
                        </Col>

                        <Col xs={24} xl={16}>
                            <Space direction="vertical" size={16} className="speaking-runner-right-stack">
                                <Card style={{ borderRadius: 20 }}>
                                    <SpeakingAvatarCanvas
                                        microphoneLevel={audioLevel}
                                        promptAudioLevel={promptAudioLevel}
                                        isPromptPlaying={isPromptPlaying && (promptPlaybackQuestionId === activeQuestionId || promptPlaybackQuestionId === 'transition')}
                                        isRecording={isRecording}
                                        promptText={promptPlaybackQuestionId === 'transition' ? transitionText : activePrompt.question.content}
                                        activeViseme={activeViseme}
                                        playbackMode={promptPlaybackMode}
                                    />
                                </Card>

                                <Card style={{ borderRadius: 20 }}>
                                    <Space direction="vertical" size={18} style={{ width: '100%' }}>
                                        <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
                                            <Space wrap>
                                                <Tag color="red">Part {activePrompt.partNumber ?? '—'}</Tag>
                                                <Tag>{activePrompt.sectionTitle || 'Speaking section'}</Tag>
                                                <Tag icon={<AudioOutlined />}>{activePrompt.promptIndex}</Tag>
                                            </Space>
                                            <Space wrap>
                                                {preparationLimitSeconds > 0 ? (
                                                    <Tag color={!hasPreparationStarted || preparationRemainingSeconds > 0 ? 'gold' : 'green'}>
                                                        Prep {preparationRemainingSeconds}s
                                                    </Tag>
                                                ) : null}
                                            </Space>
                                        </Space>

                                        <div>
                                            <Title level={4} style={{ marginBottom: 8 }}>
                                                {activePrompt.question.content}
                                            </Title>
                                            {activePrompt.partDescription ? (
                                                <Paragraph style={{ marginBottom: 0, color: '#64748b' }}>
                                                    {activePrompt.partDescription}
                                                </Paragraph>
                                            ) : null}
                                        </div>

                                        {preparationLimitSeconds > 0 ? (
                                            <Alert
                                                type={!hasPreparationStarted || preparationRemainingSeconds > 0 ? 'info' : 'success'}
                                                showIcon
                                                message="Bước 3 · Part 2 preparation"
                                                description={
                                                    !hasPreparationStarted
                                                        ? 'Bấm “Nghe examiner rồi trả lời” để examiner đọc cue card. Khi examiner đọc xong, hệ thống mới bắt đầu 60 giây chuẩn bị.'
                                                        : preparationRemainingSeconds > 0
                                                            ? `Đồng hồ chuẩn bị đang chạy. Bạn còn ${preparationRemainingSeconds} giây để đọc cue card và ghi nháp từ khóa.`
                                                            : 'Thời gian chuẩn bị đã hết. Bạn có thể bắt đầu ghi âm phần độc thoại bất cứ lúc nào.'
                                                }
                                            />
                                        ) : null}

                                        {activeCueCardPoints.length > 0 ? (
                                            <Card size="small" style={{ borderRadius: 16, background: '#f8fafc' }}>
                                                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                                                    <Text strong>Cue card / talking points</Text>
                                                    {activeCueCardPoints.map((point) => (
                                                        <Text key={point} style={{ color: '#334155' }}>
                                                            • {point}
                                                        </Text>
                                                    ))}
                                                </Space>
                                            </Card>
                                        ) : null}

                                        {activePrompt.partNumber === 2 ? (
                                            <div>
                                                <Text strong style={{ display: 'block', marginBottom: 8 }}>
                                                    Textbox ghi nháp Part 2
                                                </Text>
                                                <TextArea
                                                    rows={3}
                                                    value={activeCueCardDraft}
                                                    onChange={(event) => setCueCardDrafts((current) => ({
                                                        ...current,
                                                        [activePrompt.partId]: event.target.value,
                                                    }))}
                                                    placeholder="Gõ nhanh từ khóa, ý chính hoặc ví dụ muốn triển khai trong 2 phút nói."
                                                />
                                            </div>
                                        ) : null}

                                        {isTransitioning ? (
                                            <Space wrap>
                                                <Button
                                                    type="primary"
                                                    size="large"
                                                    className={
                                                        isNextRunning
                                                            ? (getNextPromptQuestionId(promptEntries, activeQuestionId) ? "speaking-next-btn-progress" : "speaking-next-btn-progress-success")
                                                            : nextBlinkerVisible
                                                                ? (getNextPromptQuestionId(promptEntries, activeQuestionId) ? "speaking-next-btn-blink" : "speaking-next-btn-blink-success")
                                                                : ""
                                                    }
                                                    disabled={!nextBlinkerVisible && !isNextRunning}
                                                    icon={isNextRunning ? null : getNextPromptQuestionId(promptEntries, activeQuestionId) ? <ArrowRightOutlined /> : <CheckCircleOutlined />}
                                                    onClick={handleNextTransition}
                                                    style={{
                                                        height: 48,
                                                        borderRadius: 16,
                                                        paddingInline: 28,
                                                        fontWeight: 700,
                                                        fontSize: '0.98rem',
                                                        pointerEvents: isNextRunning ? 'none' : 'auto',
                                                        background: getNextPromptQuestionId(promptEntries, activeQuestionId)
                                                            ? 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)'
                                                            : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                                        border: 'none',
                                                        boxShadow: nextBlinkerVisible && !isNextRunning
                                                            ? (getNextPromptQuestionId(promptEntries, activeQuestionId) ? '0 0 15px rgba(37, 99, 235, 0.5)' : '0 0 15px rgba(16, 185, 129, 0.5)')
                                                            : 'none',
                                                    }}
                                                >
                                                    {isNextRunning
                                                        ? (getNextPromptQuestionId(promptEntries, activeQuestionId) ? 'Đang chuẩn bị câu hỏi tiếp theo...' : 'Đang chuẩn bị màn nộp bài...')
                                                        : getNextPromptQuestionId(promptEntries, activeQuestionId)
                                                            ? (nextBlinkerVisible ? 'Chuyển sang câu tiếp theo' : 'Examiner đang chuyển tiếp...')
                                                            : (nextBlinkerVisible ? 'Hoàn thành & Xem màn nộp bài' : 'Examiner đang kết thúc...')}
                                                </Button>
                                            </Space>
                                        ) : (
                                            <Space wrap>
                                                <Button
                                                    icon={<SoundOutlined />}
                                                    loading={isPreparingPromptPlayback && promptPlaybackQuestionId === activeQuestionId}
                                                    disabled={isRecording || isExaminerLeadingActivePrompt}
                                                    onClick={() => {
                                                        if (isPromptPlaying && promptPlaybackQuestionId === activeQuestionId) {
                                                            stopPromptPlayback();
                                                            return;
                                                        }

                                                        void handleReplayPrompt(activePrompt);
                                                    }}
                                                >
                                                    {isPromptPlaying && promptPlaybackQuestionId === activeQuestionId ? 'Dừng examiner' : 'Nghe lại examiner'}
                                                </Button>
                                                <Button
                                                    type={isRecording ? 'default' : 'primary'}
                                                    danger={isRecording}
                                                    disabled={!isRecording && (!systemCheckReady || isUploadingActivePrompt || isPreparationBlockingRecording)}
                                                    icon={isRecording ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                                                    onClick={() => {
                                                        void (isRecording ? handleStopRecording() : handleBeginResponseTurn());
                                                    }}
                                                    loading={isExaminerLeadingActivePrompt && (isPreparingPromptPlayback || isPromptPlaying)}
                                                >
                                                    {isRecording
                                                        ? 'Dừng ghi âm'
                                                        : isPreparationBlockingRecording
                                                            ? `Chờ hết prep (${preparationRemainingSeconds}s)`
                                                            : isPreparationReadyToRecord
                                                                ? 'Bắt đầu ghi âm'
                                                                : isExaminerLeadingActivePrompt
                                                                    ? 'Examiner đang hỏi...'
                                                                    : preparationLimitSeconds > 0 && !hasPreparationStarted
                                                                        ? 'Nghe examiner để bắt đầu prep'
                                                                        : 'Nghe examiner rồi trả lời'}
                                                </Button>
                                            </Space>
                                        )}


                                        {isExaminerLeadingActivePrompt ? (
                                            <Alert
                                                type="info"
                                                showIcon
                                                message="Examiner đang đọc prompt"
                                                description="Khi prompt kết thúc, microphone sẽ tự bật để bạn trả lời câu này."
                                            />
                                        ) : null}

                                        {isUploadingActivePrompt ? (
                                            <Alert
                                                type="info"
                                                showIcon
                                                message="Đang tạo transcript cho câu trả lời"
                                                description="Bản ghi vừa xong đang được lưu và nhận diện lời nói để hiện transcript cho câu này."
                                            />
                                        ) : null}

                                        <div>
                                            <Text strong style={{ display: 'block', marginBottom: 8 }}>
                                                Transcript cho prompt này
                                            </Text>
                                            <Card size="small" style={{ borderRadius: 16, background: activeTranscriptText ? '#eefbf3' : '#f8fafc' }}>
                                                <Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0, color: activeTranscriptText ? '#0f172a' : '#64748b' }}>
                                                    {activeTranscriptText || 'Transcript sẽ xuất hiện ở đây ngay sau khi bạn dừng ghi âm và hệ thống nhận diện xong.'}
                                                </Paragraph>
                                            </Card>
                                        </div>

                                        {activeSpeakingAnalytics ? (
                                            <Card size="small" style={{ borderRadius: 16, background: '#fffbeb' }}>
                                                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                                                    <Space wrap>
                                                        <Text strong>Speaking analytics từ backend</Text>
                                                        {activeSpeakingAnalytics.estimatedFluencyBand != null ? (
                                                            <Tag color="gold">Fluency ~ {activeSpeakingAnalytics.estimatedFluencyBand.toFixed(1)}</Tag>
                                                        ) : null}
                                                        <Tag color={getAnalyticsTagColor(activeSpeakingAnalytics.paceLabel)}>
                                                            {speakingPaceLabelMap[activeSpeakingAnalytics.paceLabel]}
                                                        </Tag>
                                                        <Tag color={getAnalyticsTagColor(activeSpeakingAnalytics.coverageLabel)}>
                                                            {speakingCoverageLabelMap[activeSpeakingAnalytics.coverageLabel]}
                                                        </Tag>
                                                    </Space>
                                                    <Row gutter={[12, 12]}>
                                                        <Col xs={12} md={6}>
                                                            <Statistic title="Word count" value={activeSpeakingAnalytics.wordCount} />
                                                        </Col>
                                                        <Col xs={12} md={6}>
                                                            <Statistic title="WPM" value={activeSpeakingAnalytics.wordsPerMinute ?? '—'} />
                                                        </Col>
                                                        <Col xs={12} md={6}>
                                                            <Statistic
                                                                title="Coverage"
                                                                value={activeSpeakingAnalytics.coverageRatio != null ? `${Math.round(activeSpeakingAnalytics.coverageRatio * 100)}%` : '—'}
                                                            />
                                                        </Col>
                                                        <Col xs={12} md={6}>
                                                            <Statistic
                                                                title="Target"
                                                                value={activeSpeakingAnalytics.targetDurationSeconds != null ? `${activeSpeakingAnalytics.targetDurationSeconds}s` : '—'}
                                                            />
                                                        </Col>
                                                    </Row>
                                                </Space>
                                            </Card>
                                        ) : null}

                                        {(activeSavedAnswer?.feedbacks?.length ?? 0) > 0 ? (
                                            <Card size="small" style={{ borderRadius: 16 }}>
                                                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                                                    <Text strong>Feedback Speaking hiện có</Text>
                                                    {activeSavedAnswer!.feedbacks!.map((feedback) => (
                                                        <Alert
                                                            key={`${activeQuestionId}-${feedback.criteria}`}
                                                            type="info"
                                                            showIcon
                                                            message={`${feedback.criteria} · Band ${feedback.bandScore.toFixed(1)}`}
                                                            description={feedback.comment || feedback.improvements || 'Chưa có nhận xét chi tiết.'}
                                                        />
                                                    ))}
                                                </Space>
                                            </Card>
                                        ) : null}
                                    </Space>
                                </Card>
                            </Space>
                        </Col>
                    </Row>
                </Space>
            </div>
        </>
    );
};
