import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { message } from 'antd';
import {
    usePracticeSessionQuery,
    useUpdatePracticeSessionAnswersMutation,
    useUploadPracticeSpeakingRecordingMutation,
} from './useSessionQueries';
import { useSpeakingRecorder } from './useSpeakingRecorder';
import { useSpeakingPromptPlayback } from './useSpeakingPromptPlayback';
import type { PracticeSessionSpeakingAnalyticsDto } from '../types/session.types';
import type { SpeakingVisemeCue } from '../utils/speakingPlayback.utils';
import { uploadToCloudinary } from '@/shared/lib/cloudinary';
import { FINAL_PHRASES, TRANSITION_PHRASES } from '../constants/speakingSession.constants';
import {
    SpeakingPromptEntry,
    buildSpeakingAnswerMap,
    formatSeconds,
    getNextPromptQuestionId,
    getPreparationLimitSeconds,
    getRecordingLimitSeconds,
    getSpeakingPromptEntries,
    normalizeCueCardPoints,
} from '../utils/speakingSession.utils';

export const useSpeakingSessionRunner = (sessionId: string) => {
    const navigate = useNavigate();
    const { data: session, isLoading, isError } = usePracticeSessionQuery(sessionId);
    const updateAnswersMutation = useUpdatePracticeSessionAnswersMutation();
    const uploadSpeakingRecordingMutation = useUploadPracticeSpeakingRecordingMutation();

    const {
        permissionState,
        audioLevel,
        isRecording,
        lastRecording,
        errorMessage: recorderErrorMessage,
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
    const [queuedAutoRecordingQuestionId, setQueuedAutoRecordingQuestionId] = useState<string | null>(null);
    const [uploadingQuestionIds, setUploadingQuestionIds] = useState<string[]>([]);
    const [localDurationByQuestionId, setLocalDurationByQuestionId] = useState<Record<string, number>>({});
    const [localTranscriptByQuestionId, setLocalTranscriptByQuestionId] = useState<Record<string, string>>({});
    const [localSpeakingAnalyticsByQuestionId, setLocalSpeakingAnalyticsByQuestionId] = useState<
        Record<string, PracticeSessionSpeakingAnalyticsDto | null>
    >({});
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
        promptEntriesRef.current = promptEntries;
    }, [promptEntries]);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    // Silence detection: 5s silence auto stop
    useEffect(() => {
        if (!isRecording) {
            lastActiveTimeRef.current = 0;
            return;
        }

        if (lastActiveTimeRef.current === 0) {
            lastActiveTimeRef.current = Date.now();
        }

        const threshold = 0.08;
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
        setUploadingQuestionIds((current) =>
            current.includes(questionId) ? current : [...current, questionId],
        );
    }, []);

    const unmarkQuestionUploading = useCallback((questionId: string) => {
        setUploadingQuestionIds((current) => current.filter((currentId) => currentId !== questionId));
    }, []);

    const hasResolvedTranscriptOrAnalytics = useCallback((questionId: string) => {
        const savedAnswer = answerMap.get(questionId);

        return (
            !!localTranscriptByQuestionId[questionId]?.trim() ||
            !!savedAnswer?.transcriptText?.trim() ||
            localSpeakingAnalyticsByQuestionId[questionId] != null ||
            savedAnswer?.speakingAnalytics != null
        );
    }, [answerMap, localSpeakingAnalyticsByQuestionId, localTranscriptByQuestionId]);

    const hasPromptResponse = useCallback((questionId: string) => {
        const savedAnswer = answerMap.get(questionId);

        return (
            hasResolvedTranscriptOrAnalytics(questionId) ||
            !!savedAnswer?.answerText?.trim() ||
            !!savedAnswer?.audioUrl ||
            (savedAnswer?.durationSeconds ?? 0) > 0 ||
            (localDurationByQuestionId[questionId] ?? 0) > 0
        );
    }, [answerMap, hasResolvedTranscriptOrAnalytics, localDurationByQuestionId]);

    useEffect(() => {
        if (uploadingQuestionIds.length === 0) {
            return;
        }

        const resolvedQuestionIds = uploadingQuestionIds.filter((questionId) =>
            hasResolvedTranscriptOrAnalytics(questionId),
        );

        if (resolvedQuestionIds.length === 0) {
            return;
        }

        setUploadingQuestionIds((current) =>
            current.filter((questionId) => !resolvedQuestionIds.includes(questionId)),
        );
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

    const defaultQuestionId = useMemo(() => {
        const firstUnanswered = promptEntries.find(
            (entry) =>
                !hasPromptResponse(entry.question.id) &&
                !lockedPart2QuestionIds.has(entry.question.id),
        );

        return firstUnanswered?.question.id ?? promptEntries[0]?.question.id ?? null;
    }, [hasPromptResponse, lockedPart2QuestionIds, promptEntries]);

    const activeQuestionId = selectedQuestionId ?? defaultQuestionId ?? '';
    const activePrompt = useMemo(
        () => promptEntries.find((entry) => entry.question.id === activeQuestionId) ?? promptEntries[0] ?? null,
        [activeQuestionId, promptEntries],
    );

    const activeSavedAnswer = activeQuestionId ? answerMap.get(activeQuestionId) : undefined;
    const recordingLimitSeconds = getRecordingLimitSeconds(activePrompt?.partNumber);
    const preparationLimitSeconds = getPreparationLimitSeconds(activePrompt);
    const prepStartedAt = activePrompt ? prepStartedAtByQuestionId[activePrompt.question.id] : undefined;
    const hasPreparationStarted = prepStartedAt != null;
    const preparationElapsedSeconds = hasPreparationStarted
        ? Math.max(0, Math.floor((clockNow - prepStartedAt) / 1000))
        : 0;
    const preparationRemainingSeconds = preparationLimitSeconds > 0
        ? Math.max(0, preparationLimitSeconds - preparationElapsedSeconds)
        : 0;

    useEffect(() => {
        if (!selectedQuestionId && defaultQuestionId) {
            setSelectedQuestionId(defaultQuestionId);
        }
    }, [defaultQuestionId, selectedQuestionId]);

    useEffect(() => {
        if (selectedQuestionId && lockedPart2QuestionIds.has(selectedQuestionId)) {
            setSelectedQuestionId(defaultQuestionId);
        }
    }, [defaultQuestionId, lockedPart2QuestionIds, selectedQuestionId]);

    useEffect(() => {
        if (session?.timeRemaining == null) {
            return;
        }

        setTimeRemaining(session.timeRemaining);
        lastPersistedTimeRef.current = session.timeRemaining;
    }, [session?.sessionId, session?.timeRemaining]);

    useEffect(() => {
        if (session?.status !== 'InProgress') {
            return;
        }

        const interval = window.setInterval(() => setClockNow(Date.now()), 1000);
        return () => window.clearInterval(interval);
    }, [session?.status]);

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
        if (recorderErrorMessage) {
            message.error(recorderErrorMessage);
        }
    }, [recorderErrorMessage]);

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
        } catch (error: unknown) {
            message.error((error as { message?: string })?.message || 'Không thể phát prompt của giám khảo.');
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
            } catch (error: unknown) {
                setQueuedAutoRecordingQuestionId(null);
                message.error((error as { message?: string })?.message || 'Không thể phát prompt của giám khảo.');
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
            } catch (error: unknown) {
                setQueuedAutoRecordingQuestionId(null);
                message.error((error as { message?: string })?.message || 'Không thể phát prompt của giám khảo.');
            }
            return;
        }

        try {
            updateRecordingTargetQuestionId(activePrompt.question.id);
            await startRecording({ maxDurationSeconds: recordingLimitSeconds });
        } catch (error: unknown) {
            updateRecordingTargetQuestionId(null);
            message.error((error as { message?: string })?.message || recorderErrorMessage || 'Không thể bắt đầu ghi âm.');
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
        const targetQuestionId = recordingTargetQuestionIdRef.current ?? activeQuestionId;
        updateRecordingTargetQuestionId(targetQuestionId);
        await stopRecording();
    }, [activeQuestionId, stopRecording, updateRecordingTargetQuestionId]);

    const systemCheckReady = permissionState !== 'denied';

    const triggerNextPromptTransition = useCallback(async (questionIdToTransitionFrom: string) => {
        setIsTransitioning(true);
        setNextBlinkerVisible(false);
        setIsNextRunning(false);
        isNextRunningRef.current = false;

        const nextQuestionId = getNextPromptQuestionId(promptEntriesRef.current, questionIdToTransitionFrom);
        let phrase: string;

        if (nextQuestionId) {
            phrase = TRANSITION_PHRASES[Math.floor(Math.random() * TRANSITION_PHRASES.length)];
        } else {
            phrase = FINAL_PHRASES[Math.floor(Math.random() * FINAL_PHRASES.length)];
        }

        setTransitionText(phrase);

        if (nextTimeoutRef.current) {
            window.clearTimeout(nextTimeoutRef.current);
            nextTimeoutRef.current = null;
        }

        try {
            await playPrompt({
                questionId: 'transition',
                text: phrase,
                visemeTimeline: null,
                onEnd: () => {
                    setNextBlinkerVisible(true);
                },
            });
        } catch {
            setNextBlinkerVisible(true);
        }
    }, [playPrompt]);

    const handleNextTransition = useCallback(() => {
        if (isNextRunningRef.current) return;
        isNextRunningRef.current = true;
        setIsNextRunning(true);

        if (nextTimeoutRef.current) {
            window.clearTimeout(nextTimeoutRef.current);
            nextTimeoutRef.current = null;
        }

        stopPromptPlayback();
        void stopRecording();

        const currentActiveId = recordingTargetQuestionIdRef.current ?? activeQuestionId;
        const nextQuestionId = getNextPromptQuestionId(promptEntriesRef.current, currentActiveId);

        setTimeout(() => {
            setIsTransitioning(false);
            setNextBlinkerVisible(false);
            setTransitionText(null);
            setIsNextRunning(false);
            isNextRunningRef.current = false;

            if (nextQuestionId) {
                setSelectedQuestionId(nextQuestionId);
                const nextEntry = promptEntriesRef.current.find((entry) => entry.question.id === nextQuestionId);
                if (nextEntry) {
                    setQueuedAutoRecordingQuestionId(nextQuestionId);
                    const promptTimeline = nextEntry.question.promptVisemeTimeline?.map((cue) => ({
                        code: cue.code as SpeakingVisemeCue['code'],
                        startMs: cue.startMs,
                        endMs: cue.endMs,
                    })) ?? null;

                    void playPrompt({
                        questionId: nextEntry.question.id,
                        text: nextEntry.question.content,
                        visemeTimeline: promptTimeline,
                        estimatedDurationMs: nextEntry.question.promptEstimatedDurationMs,
                    }).catch((error: unknown) => {
                        setQueuedAutoRecordingQuestionId(null);
                        message.error((error as { message?: string })?.message || 'Không thể phát prompt của giám khảo.');
                    });
                }
            } else {
                navigate(`/app/sessions/${activeSessionIdRef.current}/submit`);
            }
        }, 3000);
    }, [activeQuestionId, navigate, playPrompt, stopPromptPlayback, stopRecording]);

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
            } catch (error: unknown) {
                if (!cancelled) {
                    updateRecordingTargetQuestionId(null);
                    message.error((error as { message?: string })?.message || recorderErrorMessage || 'Không thể bắt đầu ghi âm.');
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

    const uploadRecording = useCallback(async (
        targetSessionId: string,
        targetQuestionId: string,
        recordingBlob: Blob,
        recordingDurationSeconds: number,
        mimeType?: string,
    ) => {
        markQuestionUploading(targetQuestionId);

        try {
            const uploadFile = new File(
                [recordingBlob],
                `speaking-${targetSessionId}-${targetQuestionId}.webm`,
                { type: mimeType || 'audio/webm' },
            );
            const audioUrl = await uploadToCloudinary(uploadFile, 'video');
            const fileSizeKB = Math.round(uploadFile.size / 1024);

            setLocalDurationByQuestionId((current) => ({
                ...current,
                [targetQuestionId]: recordingDurationSeconds,
            }));

            const result = await uploadSpeakingRecordingMutation.mutateAsync({
                sessionId: targetSessionId,
                data: {
                    speakingQuestionId: targetQuestionId,
                    durationSeconds: recordingDurationSeconds,
                    audioUrl,
                    fileSizeKB,
                },
            });

            if (!isMountedRef.current || targetSessionId !== activeSessionIdRef.current) {
                return;
            }

            setLocalTranscriptByQuestionId((current) => ({
                ...current,
                [targetQuestionId]: result.transcriptText ?? '',
            }));

            setLocalSpeakingAnalyticsByQuestionId((current) => ({
                ...current,
                [targetQuestionId]: result.speakingAnalytics,
            }));

            message.success('Đã lưu bản ghi âm Speaking thành công.');
        } catch (error: unknown) {
            if (!isMountedRef.current || targetSessionId !== activeSessionIdRef.current) {
                return;
            }

            const apiMessage = typeof error === 'object' && error !== null && 'message' in error
                ? String((error as { message?: string }).message)
                : 'Không thể upload bản ghi âm Speaking.';
            message.error(apiMessage);
        } finally {
            if (isMountedRef.current && targetSessionId === activeSessionIdRef.current) {
                unmarkQuestionUploading(targetQuestionId);
            }
        }
    }, [
        markQuestionUploading,
        unmarkQuestionUploading,
        uploadSpeakingRecordingMutation,
    ]);

    useEffect(() => {
        if (!lastRecording || isRecording) {
            return;
        }

        const targetQuestionId = recordingTargetQuestionIdRef.current ?? activeQuestionId;
        const recordingKey = `${targetQuestionId}:${lastRecording.durationSeconds}:${lastRecording.blob.size}`;

        if (!targetQuestionId || lastHandledRecordingKeyRef.current === recordingKey) {
            return;
        }

        lastHandledRecordingKeyRef.current = recordingKey;

        void uploadRecording(
            sessionId,
            targetQuestionId,
            lastRecording.blob,
            lastRecording.durationSeconds,
            lastRecording.mimeType,
        );

        void triggerNextPromptTransition(targetQuestionId);
    }, [
        activeQuestionId,
        isRecording,
        lastRecording,
        sessionId,
        triggerNextPromptTransition,
        uploadRecording,
    ]);

    useEffect(() => {
        return () => {
            if (nextTimeoutRef.current) {
                window.clearTimeout(nextTimeoutRef.current);
                nextTimeoutRef.current = null;
            }
            stopPromptPlaybackRef.current();
            void stopRecordingRef.current();
        };
    }, []);

    useEffect(() => {
        if (
            preparationLimitSeconds === 0
            || !hasPreparationStarted
            || preparationRemainingSeconds > 0
            || isRecording
            || isPromptPlaying
            || isPreparingPromptPlayback
            || queuedAutoRecordingQuestionId
            || uploadingQuestionIds.includes(activeQuestionId)
        ) {
            return;
        }

        let cancelled = false;

        const autoBeginPart2Recording = async () => {
            if (cancelled) {
                return;
            }

            message.success('Đã hết 60 giây chuẩn bị. Hệ thống bắt đầu ghi âm Part 2.');
            try {
                updateRecordingTargetQuestionId(activeQuestionId);
                await startRecording({ maxDurationSeconds: recordingLimitSeconds });
            } catch (error: unknown) {
                if (!cancelled) {
                    updateRecordingTargetQuestionId(null);
                    message.error((error as { message?: string })?.message || recorderErrorMessage || 'Không thể bắt đầu ghi âm.');
                }
            }
        };

        void autoBeginPart2Recording();

        return () => {
            cancelled = true;
        };
    }, [
        activeQuestionId,
        hasPreparationStarted,
        isPreparingPromptPlayback,
        isPromptPlaying,
        isRecording,
        preparationLimitSeconds,
        preparationRemainingSeconds,
        queuedAutoRecordingQuestionId,
        recorderErrorMessage,
        recordingLimitSeconds,
        startRecording,
        updateRecordingTargetQuestionId,
        uploadingQuestionIds,
    ]);

    const activeCueCardDraft = (activePrompt ? cueCardDrafts[activePrompt.partId] : undefined) ?? '';
    const activeCueCardPoints = activePrompt ? normalizeCueCardPoints(activePrompt.question.cueCardPoints) : [];
    const activeTranscriptText = localTranscriptByQuestionId[activeQuestionId]
        || activeSavedAnswer?.transcriptText
        || '';
    const activeSpeakingAnalytics = localSpeakingAnalyticsByQuestionId[activeQuestionId]
        ?? activeSavedAnswer?.speakingAnalytics
        ?? null;
    const isUploadingActivePrompt = uploadingQuestionIds.includes(activeQuestionId) && !hasResolvedTranscriptOrAnalytics(activeQuestionId);
    const isExaminerLeadingActivePrompt = queuedAutoRecordingQuestionId === activeQuestionId;
    const isPreparationBlockingRecording = preparationLimitSeconds > 0 && hasPreparationStarted && preparationRemainingSeconds > 0;
    const isPreparationReadyToRecord = preparationLimitSeconds > 0 && hasPreparationStarted && preparationRemainingSeconds === 0;
    const timerText = formatSeconds(timeRemaining);

    return {
        session,
        isLoading,
        isError,
        promptEntries,
        activePrompt,
        activeQuestionId,
        setSelectedQuestionId,
        lockedPart2QuestionIds,
        uploadingQuestionIds,
        hasPromptResponse,
        hasResolvedTranscriptOrAnalytics,
        cueCardDrafts,
        setCueCardDrafts,
        timeRemaining,
        timerText,
        isTransitioning,
        nextBlinkerVisible,
        transitionText,
        isNextRunning,
        handleNextTransition,
        audioLevel,
        promptAudioLevel,
        isRecording,
        isPromptPlaying,
        isPreparingPromptPlayback,
        promptPlaybackQuestionId,
        activeViseme,
        promptPlaybackMode,
        stopPromptPlayback,
        handleReplayPrompt,
        handleBeginResponseTurn,
        handleStopRecording,
        systemCheckReady,
        isUploadingActivePrompt,
        isExaminerLeadingActivePrompt,
        isPreparationBlockingRecording,
        isPreparationReadyToRecord,
        preparationLimitSeconds,
        hasPreparationStarted,
        preparationRemainingSeconds,
        activeCueCardPoints,
        activeCueCardDraft,
        activeTranscriptText,
        activeSpeakingAnalytics,
        activeSavedAnswer,
    };
};
