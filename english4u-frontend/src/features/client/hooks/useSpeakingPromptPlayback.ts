import { useCallback, useEffect, useRef, useState } from 'react';
import {
    buildApproximateVisemeTimeline,
    buildSyntheticLevel,
    buildWordMarkers,
    buildWordVisemeTimeline,
    estimateSpeechDurationMs,
    estimateWordDurationMs,
    resolveVisemeAtTime,
    resolveWordMarkerAtCharIndex,
    scaleVisemeTimeline,
    type SpeakingVisemeCode,
    type SpeakingVisemeCue,
} from '../lib/speakingPlayback';

type PromptPlaybackMode = 'browser-voice' | null;

interface PlaySpeakingPromptOptions {
    questionId: string;
    text: string;
    visemeTimeline?: SpeakingVisemeCue[] | null;
    estimatedDurationMs?: number | null;
}

const toPromptPlaybackErrorMessage = (error: unknown) => {
    if (error instanceof Error && error.message) {
        return error.message;
    }

    return 'Không thể phát prompt speaking.';
};

const resolveEnglishVoice = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        return null;
    }

    return window.speechSynthesis
        .getVoices()
        .find((voice) => voice.lang.toLowerCase().startsWith('en')) ?? null;
};

export const useSpeakingPromptPlayback = () => {
    const animationFrameRef = useRef<number | null>(null);
    const speechStartedAtRef = useRef<number | null>(null);
    const visemeTimelineRef = useRef<SpeakingVisemeCue[]>([]);

    const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
    const [isPreparing, setIsPreparing] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackMode, setPlaybackMode] = useState<PromptPlaybackMode>(null);
    const [audioLevel, setAudioLevel] = useState(0);
    const [activeViseme, setActiveViseme] = useState<SpeakingVisemeCode>('X');

    const clearFrameLoop = useCallback(() => {
        if (animationFrameRef.current != null) {
            window.cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
    }, []);

    const stopPlayback = useCallback(() => {
        clearFrameLoop();

        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }

        speechStartedAtRef.current = null;
        visemeTimelineRef.current = [];

        setIsPreparing(false);
        setIsPlaying(false);
        setPlaybackMode(null);
        setAudioLevel(0);
        setActiveViseme('X');
        setActiveQuestionId(null);
    }, [clearFrameLoop]);

    const publishFrame = useCallback((level: number, viseme: SpeakingVisemeCode) => {
        setAudioLevel(Number(level.toFixed(2)));
        setActiveViseme(viseme);
    }, []);

    const startFrameLoop = useCallback((getElapsedMs: () => number) => {
        clearFrameLoop();

        const tick = () => {
            const elapsedMs = Math.max(0, getElapsedMs());
            const viseme = resolveVisemeAtTime(visemeTimelineRef.current, elapsedMs);
            const level = buildSyntheticLevel(viseme, elapsedMs);
            publishFrame(level, viseme);
            animationFrameRef.current = window.requestAnimationFrame(tick);
        };

        tick();
    }, [clearFrameLoop, publishFrame]);

    const playPrompt = useCallback(async (options: PlaySpeakingPromptOptions) => {
        const { questionId, text, visemeTimeline, estimatedDurationMs } = options;

        stopPlayback();

        const normalizedText = text.trim();
        if (!normalizedText) {
            throw new Error('Prompt speaking đang rỗng.');
        }

        if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
            throw new Error('Trình duyệt này chưa hỗ trợ phát prompt bằng speech synthesis.');
        }

        setActiveQuestionId(questionId);
        setIsPreparing(true);
        setAudioLevel(0);
        setActiveViseme('X');

        const fallbackDurationMs = estimatedDurationMs ?? estimateSpeechDurationMs(normalizedText);
        const baseTimeline = visemeTimeline && visemeTimeline.length > 0
            ? visemeTimeline
            : buildApproximateVisemeTimeline(normalizedText, fallbackDurationMs);
        const wordMarkers = buildWordMarkers(normalizedText);

        const utterance = new SpeechSynthesisUtterance(normalizedText);
        utterance.lang = 'en-US';
        utterance.rate = 1;

        const englishVoice = resolveEnglishVoice();
        if (englishVoice) {
            utterance.voice = englishVoice;
        }

        const speechDurationMs = estimatedDurationMs ?? estimateSpeechDurationMs(normalizedText, utterance.rate);
        visemeTimelineRef.current = scaleVisemeTimeline(baseTimeline, speechDurationMs);

        let lastBoundaryWordStartIndex = -1;
        utterance.onboundary = (event) => {
            if (speechStartedAtRef.current == null || typeof event.charIndex !== 'number') {
                return;
            }

            const marker = resolveWordMarkerAtCharIndex(wordMarkers, event.charIndex);
            if (!marker || marker.startIndex === lastBoundaryWordStartIndex) {
                return;
            }

            lastBoundaryWordStartIndex = marker.startIndex;
            const elapsedMs = Math.max(0, performance.now() - speechStartedAtRef.current);
            visemeTimelineRef.current = buildWordVisemeTimeline(
                marker.word,
                elapsedMs,
                estimateWordDurationMs(marker.word, utterance.rate),
            );
        };

        utterance.onend = () => {
            stopPlayback();
        };

        utterance.onerror = () => {
            stopPlayback();
        };

        speechStartedAtRef.current = performance.now();
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);

        setIsPreparing(false);
        setIsPlaying(true);
        setPlaybackMode('browser-voice');

        startFrameLoop(() => {
            if (speechStartedAtRef.current == null) {
                return 0;
            }

            return performance.now() - speechStartedAtRef.current;
        });
    }, [startFrameLoop, stopPlayback]);

    useEffect(() => () => {
        stopPlayback();
    }, [stopPlayback]);

    return {
        activeQuestionId,
        isPreparing,
        isPlaying,
        playbackMode,
        audioLevel,
        activeViseme,
        playPrompt: async (options: PlaySpeakingPromptOptions) => {
            try {
                await playPrompt(options);
            } catch (error) {
                throw new Error(toPromptPlaybackErrorMessage(error));
            }
        },
        stopPlayback,
    };
};
