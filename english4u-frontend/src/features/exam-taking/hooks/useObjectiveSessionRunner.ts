import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    usePracticeSessionHighlightsQuery,
    useUpdatePracticeSessionAnswersMutation,
    useUpdatePracticeSessionHighlightsMutation,
} from './useSessionQueries';
import type { PracticeSessionDto } from '../types/session.types';
import {
    getListeningAttemptMode,
    getListeningAudioPositionSeconds,
    getListeningResumePositionSeconds,
    setListeningAudioPositionSeconds,
    setListeningAttemptMode,
    type ListeningAttemptMode,
} from '../utils/listeningSession.utils';
import {
    getHighlightStorageKey,
    createRunnerHighlightId,
    parseStoredHighlights,
    normalizeRunnerHighlights,
    applyRunnerHighlightPatch,
} from '../utils/highlight.utils';
import type {
    RunnerHighlight,
    RunnerHighlightPatch,
} from '../constants/highlight.constants';
import { buildInitialAnswers } from '../utils/objectiveRunner.utils';

export interface UseObjectiveSessionRunnerOptions {
    sessionId: string;
    expectedSkill: 'READING' | 'LISTENING';
    session?: PracticeSessionDto;
    sharedListeningAudioUrl?: string | null;
    navigationItemsCount: number;
}

export const useObjectiveSessionRunner = ({
    sessionId,
    expectedSkill,
    session,
    sharedListeningAudioUrl,
    navigationItemsCount,
}: UseObjectiveSessionRunnerOptions) => {
    const navigate = useNavigate();
    const location = useLocation();

    const { data: serverHighlights } = usePracticeSessionHighlightsQuery(
        sessionId,
        !!sessionId && session?.status === 'InProgress',
    );
    const updateAnswersMutation = useUpdatePracticeSessionAnswersMutation();
    const updateHighlightsMutation = useUpdatePracticeSessionHighlightsMutation();

    const [answerMap, setAnswerMap] = useState<Record<string, string>>({});
    const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
    const [autosaveLabel, setAutosaveLabel] = useState('Chưa lưu');
    const [activeItemIndex, setActiveItemIndex] = useState(0);
    const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
    const [listeningAttemptMode, setListeningAttemptModeState] = useState<ListeningAttemptMode>('practice');
    const [audioCurrentTime, setAudioCurrentTime] = useState(0);
    const [audioDuration, setAudioDuration] = useState(0);
    const [mockCountdownSeconds, setMockCountdownSeconds] = useState<number | null>(null);
    const [, setPracticeAudioPlaying] = useState(false);
    const [highlights, setHighlights] = useState<RunnerHighlight[]>([]);

    const dirtyAnswersRef = useRef<Record<string, string>>({});
    const timerValueRef = useRef<number | null>(null);
    const lastPersistedTimeRef = useRef<number | null>(null);
    const hasRedirectedOnTimeoutRef = useRef(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const lastStoredAudioSecondRef = useRef<number>(-1);
    const audioResumeAppliedRef = useRef(false);
    const mockReplayGuardRef = useRef(false);
    const skipNextHighlightPersistRef = useRef(false);
    const serverHighlightsHydratedRef = useRef<string | null>(null);

    useEffect(() => {
        if (!session) {
            return;
        }

        setAnswerMap(buildInitialAnswers(session));
        skipNextHighlightPersistRef.current = true;
        serverHighlightsHydratedRef.current = null;
        setHighlights(parseStoredHighlights(window.localStorage.getItem(getHighlightStorageKey(session.sessionId))));
        setTimeRemaining(session.timeRemaining ?? null);
        timerValueRef.current = session.timeRemaining ?? null;
        lastPersistedTimeRef.current = session.timeRemaining ?? null;
        setAutosaveLabel('Đã đồng bộ với server');
        if (expectedSkill === 'LISTENING') {
            setAudioCurrentTime(getListeningAudioPositionSeconds(session.sessionId));
            setAudioDuration(0);
            setPracticeAudioPlaying(false);
            setMockCountdownSeconds(null);
            audioResumeAppliedRef.current = false;
            lastStoredAudioSecondRef.current = -1;
        }
    }, [expectedSkill, session?.sessionId]);

    useEffect(() => {
        if (!session?.sessionId) {
            return;
        }

        if (skipNextHighlightPersistRef.current) {
            skipNextHighlightPersistRef.current = false;
            return;
        }

        window.localStorage.setItem(getHighlightStorageKey(session.sessionId), JSON.stringify(highlights));
    }, [highlights, session?.sessionId]);

    useEffect(() => {
        if (!session?.sessionId || !serverHighlights || serverHighlightsHydratedRef.current === session.sessionId) {
            return;
        }

        serverHighlightsHydratedRef.current = session.sessionId;
        const localHighlights = parseStoredHighlights(window.localStorage.getItem(getHighlightStorageKey(session.sessionId)));
        const normalizedServerHighlights = normalizeRunnerHighlights(serverHighlights);
        const nextHighlights = normalizedServerHighlights.length > 0
            ? normalizedServerHighlights
            : localHighlights;

        skipNextHighlightPersistRef.current = true;
        setHighlights(nextHighlights);

        if (normalizedServerHighlights.length === 0 && localHighlights.length > 0 && session.status === 'InProgress') {
            updateHighlightsMutation.mutate({
                sessionId: session.sessionId,
                data: { highlights: localHighlights },
            });
        }
    }, [serverHighlights, session?.sessionId, session?.status]);

    useEffect(() => {
        setHeaderSlot(document.getElementById('client-page-header-slot'));
    }, []);

    useEffect(() => {
        timerValueRef.current = timeRemaining;
    }, [timeRemaining]);

    useEffect(() => {
        if (expectedSkill !== 'LISTENING' || !sessionId) {
            return;
        }

        const locationMode = (location.state as { listeningAttemptMode?: ListeningAttemptMode } | null)?.listeningAttemptMode;
        const nextMode = locationMode ?? getListeningAttemptMode(sessionId);
        setListeningAttemptMode(sessionId, nextMode);
        setListeningAttemptModeState(nextMode);
    }, [expectedSkill, location.state, sessionId]);

    useEffect(() => {
        setActiveItemIndex((current) => {
            if (navigationItemsCount === 0) {
                return 0;
            }

            return Math.min(current, navigationItemsCount - 1);
        });
    }, [navigationItemsCount]);

    const flushAnswers = (includeTimerOnly = false) => {
        if (!sessionId) {
            return;
        }

        const dirtyAnswers = Object.entries(dirtyAnswersRef.current).map(([questionId, answerText]) => ({
            questionId,
            answerText: answerText || null,
        }));

        const nextTimeRemaining = timerValueRef.current;
        const shouldPersistTimer = nextTimeRemaining !== lastPersistedTimeRef.current;

        if (!includeTimerOnly && dirtyAnswers.length === 0 && !shouldPersistTimer) {
            return;
        }

        if (includeTimerOnly && !shouldPersistTimer) {
            return;
        }

        const payload = {
            sessionId,
            data: {
                timeRemaining: nextTimeRemaining,
                answers: includeTimerOnly ? [] : dirtyAnswers,
            },
        };

        if (!includeTimerOnly) {
            dirtyAnswersRef.current = {};
        }

        lastPersistedTimeRef.current = nextTimeRemaining;
        setAutosaveLabel('Đang lưu...');
        updateAnswersMutation.mutate(payload, {
            onSuccess: () => {
                setAutosaveLabel('Đã lưu tự động');
            },
            onError: () => {
                setAutosaveLabel('Lưu tạm thất bại');
            },
        });
    };

    useEffect(() => {
        const timeout = window.setInterval(() => {
            flushAnswers(true);
        }, 15000);

        return () => window.clearInterval(timeout);
    }, [sessionId]);

    useEffect(() => {
        if (!session || session.status !== 'InProgress' || timeRemaining == null) {
            return;
        }

        const interval = window.setInterval(() => {
            setTimeRemaining((current) => {
                if (current == null) {
                    return current;
                }

                const nextValue = Math.max(0, current - 1);
                if (nextValue === 0 && !hasRedirectedOnTimeoutRef.current) {
                    hasRedirectedOnTimeoutRef.current = true;
                    flushAnswers();
                    navigate(`/app/sessions/${sessionId}/submit?auto=1`, { replace: true });
                }
                return nextValue;
            });
        }, 1000);

        return () => window.clearInterval(interval);
    }, [session?.status, timeRemaining, navigate, sessionId]);

    useEffect(() => () => {
        flushAnswers();
    }, []);

    const handleAnswerChange = (questionId: string, nextValue: string) => {
        setAnswerMap((current) => ({ ...current, [questionId]: nextValue }));
        dirtyAnswersRef.current = { ...dirtyAnswersRef.current, [questionId]: nextValue };
        setAutosaveLabel('Chưa lưu');
    };

    const handleCreateHighlight = (highlight: RunnerHighlightPatch) => {
        const now = new Date().toISOString();
        setHighlights((current) => {
            const nextHighlights = applyRunnerHighlightPatch(current, {
                ...highlight,
                id: createRunnerHighlightId(),
                createdAt: now,
                updatedAt: now,
            });

            if (session?.sessionId && session.status === 'InProgress') {
                updateHighlightsMutation.mutate({
                    sessionId: session.sessionId,
                    data: { highlights: nextHighlights },
                });
            }

            return nextHighlights;
        });
    };

    const handleDeleteHighlight = (highlightId: string) => {
        setHighlights((current) => {
            const nextHighlights = current.filter((highlight) => highlight.id !== highlightId);

            if (session?.sessionId && session.status === 'InProgress') {
                updateHighlightsMutation.mutate({
                    sessionId: session.sessionId,
                    data: { highlights: nextHighlights },
                });
            }

            return nextHighlights;
        });
    };

    const handleNavigationItemChange = (index: number) => {
        setActiveItemIndex(index);
        window.requestAnimationFrame(() => {
            document.getElementById('runner-active-section')?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
            });
        });
    };

    useEffect(() => {
        if (Object.keys(dirtyAnswersRef.current).length === 0) {
            return;
        }

        const timeout = window.setTimeout(() => {
            flushAnswers();
        }, 900);

        return () => window.clearTimeout(timeout);
    }, [answerMap]);

    useEffect(() => {
        if (expectedSkill !== 'LISTENING' || !sessionId || !sharedListeningAudioUrl) {
            return;
        }

        const audioElement = audioRef.current;
        if (!audioElement) {
            return;
        }

        const handleLoadedMetadata = () => {
            const resumePosition = getListeningResumePositionSeconds(sessionId);
            if (!audioResumeAppliedRef.current && resumePosition > 0) {
                audioElement.currentTime = resumePosition;
                audioResumeAppliedRef.current = true;
                setAudioCurrentTime(resumePosition);
            }

            setAudioDuration(Number.isFinite(audioElement.duration) ? audioElement.duration : 0);
        };

        const handleTimeUpdate = () => {
            const nextCurrentTime = audioElement.currentTime;
            setAudioCurrentTime(nextCurrentTime);
            const flooredSecond = Math.floor(nextCurrentTime);
            if (flooredSecond !== lastStoredAudioSecondRef.current) {
                lastStoredAudioSecondRef.current = flooredSecond;
                setListeningAudioPositionSeconds(sessionId, nextCurrentTime);
            }
        };

        const handleEnded = () => {
            setAudioCurrentTime(audioElement.duration || 0);
            setPracticeAudioPlaying(false);
            setMockCountdownSeconds(null);
            setListeningAudioPositionSeconds(sessionId, audioElement.duration || 0);
        };

        const handlePlay = () => {
            setPracticeAudioPlaying(true);
        };

        const handlePause = () => {
            const isMockMode = listeningAttemptMode === 'mock';
            const isEnded = audioElement.ended;
            setPracticeAudioPlaying(false);

            if (isMockMode && !isEnded && !mockReplayGuardRef.current) {
                mockReplayGuardRef.current = true;
                window.setTimeout(() => {
                    audioElement.play().catch(() => undefined).finally(() => {
                        mockReplayGuardRef.current = false;
                    });
                }, 0);
            }
        };

        audioElement.addEventListener('loadedmetadata', handleLoadedMetadata);
        audioElement.addEventListener('timeupdate', handleTimeUpdate);
        audioElement.addEventListener('ended', handleEnded);
        audioElement.addEventListener('play', handlePlay);
        audioElement.addEventListener('pause', handlePause);

        if (audioElement.readyState >= 1) {
            handleLoadedMetadata();
        }

        return () => {
            audioElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
            audioElement.removeEventListener('timeupdate', handleTimeUpdate);
            audioElement.removeEventListener('ended', handleEnded);
            audioElement.removeEventListener('play', handlePlay);
            audioElement.removeEventListener('pause', handlePause);
        };
    }, [expectedSkill, listeningAttemptMode, sessionId, sharedListeningAudioUrl]);

    useEffect(() => {
        if (expectedSkill !== 'LISTENING' || listeningAttemptMode !== 'mock' || !sharedListeningAudioUrl || session?.status !== 'InProgress') {
            setMockCountdownSeconds(null);
            return;
        }

        const audioElement = audioRef.current;
        if (!audioElement || audioElement.ended) {
            return;
        }

        setMockCountdownSeconds(10);
        const interval = window.setInterval(() => {
            setMockCountdownSeconds((current) => {
                if (current == null) {
                    return current;
                }

                if (current <= 1) {
                    audioElement.play().catch(() => undefined);
                    window.clearInterval(interval);
                    return 0;
                }

                return current - 1;
            });
        }, 1000);

        return () => window.clearInterval(interval);
    }, [expectedSkill, listeningAttemptMode, session?.status, sharedListeningAudioUrl, session?.sessionId]);

    useEffect(() => () => {
        if (expectedSkill === 'LISTENING' && sessionId && audioRef.current) {
            setListeningAudioPositionSeconds(sessionId, audioRef.current.currentTime || 0);
        }
    }, [expectedSkill, sessionId]);

    const timerText = timeRemaining == null
        ? 'Không giới hạn'
        : `${Math.floor(timeRemaining / 60)}:${String(timeRemaining % 60).padStart(2, '0')}`;
    const audioProgressPercent = audioDuration > 0
        ? Math.min(100, Math.max(0, (audioCurrentTime / audioDuration) * 100))
        : 0;
    const mockCountdownLabel = mockCountdownSeconds != null && mockCountdownSeconds > 0
        ? `Tự phát sau ${mockCountdownSeconds}s`
        : 'Đang phát như thi thật';

    return {
        answerMap,
        autosaveLabel,
        activeItemIndex,
        headerSlot,
        listeningAttemptMode,
        audioCurrentTime,
        audioDuration,
        audioProgressPercent,
        mockCountdownLabel,
        highlights,
        timerText,
        audioRef,
        handleAnswerChange,
        handleCreateHighlight,
        handleDeleteHighlight,
        handleNavigationItemChange,
    };
};

