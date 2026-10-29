import { useCallback, useEffect, useRef, useState } from 'react';
import { CURATED_VOICES } from '../constants/dictation.constants';
import { ENV } from '@/constants/env';

export { CURATED_VOICES };

export function useDictationAudio() {
    const [selectedVoiceId, setSelectedVoiceId] = useState<string>('en-US-JennyNeural');
    const [rate, setRate] = useState<number>(1.0);
    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const [isLoadingAudio, setIsLoadingAudio] = useState<boolean>(false);
    const [isNeuralMode, setIsNeuralMode] = useState<boolean>(true);

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const synthRef = useRef<SpeechSynthesis | null>(null);
    const lastSpokenTextRef = useRef<string>('');
    const isStoppedRef = useRef<boolean>(false);
    const isDisposedRef = useRef<boolean>(false);

    // Initialize Audio & SpeechSynthesis
    useEffect(() => {
        isDisposedRef.current = false;
        if (typeof window !== 'undefined') {
            audioRef.current = new Audio();
            audioRef.current.preload = 'auto';

            if ('speechSynthesis' in window) {
                synthRef.current = window.speechSynthesis;
                window.speechSynthesis.getVoices();
                window.speechSynthesis.onvoiceschanged = () => {
                    window.speechSynthesis.getVoices();
                };
            }

            return () => {
                isDisposedRef.current = true;
                isStoppedRef.current = true;
                if (audioRef.current) {
                    audioRef.current.onplaying = null;
                    audioRef.current.onended = null;
                    audioRef.current.onerror = null;
                    audioRef.current.pause();
                    audioRef.current.removeAttribute('src');
                    audioRef.current.load();
                }
                if (synthRef.current) {
                    synthRef.current.cancel();
                }
            };
        }
    }, []);

    // Stop all audio playback safely without triggering fallback synthesis
    const stop = useCallback(() => {
        isStoppedRef.current = true;
        if (audioRef.current) {
            audioRef.current.onplaying = null;
            audioRef.current.onended = null;
            audioRef.current.onerror = null;
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            audioRef.current.removeAttribute('src');
            audioRef.current.load();
        }
        if (synthRef.current) {
            synthRef.current.cancel();
        }
        setIsPlaying(false);
        setIsLoadingAudio(false);
    }, []);

    // Fallback: Browser local synthesizer with distinct male/female matching and pitch differentiation
    const playWithBrowserSynth = useCallback((cleanText: string, effectiveRate: number) => {
        if (isStoppedRef.current || isDisposedRef.current) return;
        if (!synthRef.current) {
            setIsPlaying(false);
            setIsLoadingAudio(false);
            return;
        }

        synthRef.current.cancel();
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.rate = effectiveRate;

        const persona = CURATED_VOICES.find((v) => v.id === selectedVoiceId);
        const targetLang = persona?.accent === 'US' ? 'en-US' : persona?.accent === 'UK' ? 'en-GB' : 'en-AU';
        const isMale = persona?.gender === 'male';

        // Set pitch distinctly so male is deep and female is melodic even on basic synthesizers
        utterance.pitch = isMale ? 0.85 : 1.15;

        const voices = synthRef.current.getVoices();
        if (voices.length > 0) {
            // 1. Try finding by persona name
            let match = voices.find(
                (v) =>
                    v.name.toLowerCase().includes(persona?.name.toLowerCase() ?? '') &&
                    v.lang.replace('_', '-').toLowerCase().startsWith(targetLang.toLowerCase())
            );

            // 2. Try finding by gender keywords + target language
            if (!match) {
                const maleKeywords = ['male', 'david', 'guy', 'ryan', 'george', 'mark', 'james', 'richard'];
                const femaleKeywords = ['female', 'zira', 'jenny', 'sonia', 'natasha', 'aria', 'hazel', 'susan', 'samantha', 'karen', 'victoria'];
                const targetKeywords = isMale ? maleKeywords : femaleKeywords;

                match = voices.find(
                    (v) =>
                        v.lang.replace('_', '-').toLowerCase().startsWith(targetLang.toLowerCase()) &&
                        targetKeywords.some((kw) => v.name.toLowerCase().includes(kw))
                );
            }

            // 3. Try finding any voice matching gender across English
            if (!match) {
                const maleKeywords = ['male', 'david', 'guy', 'ryan', 'george', 'mark'];
                const femaleKeywords = ['female', 'zira', 'jenny', 'sonia', 'natasha', 'aria', 'hazel'];
                const targetKeywords = isMale ? maleKeywords : femaleKeywords;

                match = voices.find(
                    (v) =>
                        v.lang.startsWith('en') &&
                        targetKeywords.some((kw) => v.name.toLowerCase().includes(kw))
                );
            }

            // 4. Default to accent match or first English voice
            if (!match) {
                match = voices.find((v) => v.lang.replace('_', '-').toLowerCase().startsWith(targetLang.toLowerCase()))
                    ?? voices.find((v) => v.lang.startsWith('en'));
            }

            if (match) {
                utterance.voice = match;
            }
        }

        utterance.onstart = () => {
            setIsLoadingAudio(false);
            setIsPlaying(true);
        };
        utterance.onend = () => {
            setIsLoadingAudio(false);
            setIsPlaying(false);
        };
        utterance.onerror = () => {
            setIsLoadingAudio(false);
            setIsPlaying(false);
        };

        synthRef.current.speak(utterance);
    }, [selectedVoiceId]);

    // Main speak function using Edge Neural Audio API
    const speak = useCallback(
        (text: string, customRate?: number, customVoiceId?: string) => {
            const cleanText = text.trim();
            if (!cleanText) return;

            stop();
            isStoppedRef.current = false;
            lastSpokenTextRef.current = cleanText;
            const effectiveRate = customRate ?? rate;
            const effectiveVoice = customVoiceId ?? selectedVoiceId;

            // Build API URL using backend base URL
            const rawBase = ENV.API_BASE_URL || '/api';
            const base = rawBase.replace(/\/+$/, '');
            const apiUrl = `${base}/practice/dictation/audio?text=${encodeURIComponent(cleanText)}&voice=${encodeURIComponent(effectiveVoice)}&rate=${effectiveRate}`;

            if (audioRef.current && isNeuralMode) {
                setIsLoadingAudio(true);
                audioRef.current.src = apiUrl;

                audioRef.current.onplaying = () => {
                    if (isStoppedRef.current || isDisposedRef.current) return;
                    setIsLoadingAudio(false);
                    setIsPlaying(true);
                };

                audioRef.current.onended = () => {
                    setIsLoadingAudio(false);
                    setIsPlaying(false);
                };

                audioRef.current.onerror = (e) => {
                    if (isStoppedRef.current || isDisposedRef.current) return;
                    console.warn('[DictationAudio] Neural API unavailable, switching to browser synthesis with gender mapping:', e);
                    setIsLoadingAudio(false);
                    playWithBrowserSynth(cleanText, effectiveRate);
                };

                audioRef.current.play().catch((err) => {
                    if (isStoppedRef.current || isDisposedRef.current) return;
                    if (err.name === 'AbortError') {
                        // User clicked another sound before first loaded; let the new one play
                        return;
                    }
                    console.warn('[DictationAudio] Play interrupted or blocked, falling back:', err);
                    setIsLoadingAudio(false);
                    playWithBrowserSynth(cleanText, effectiveRate);
                });
            } else {
                playWithBrowserSynth(cleanText, effectiveRate);
            }
        },
        [isNeuralMode, playWithBrowserSynth, rate, selectedVoiceId, stop]
    );

    const replay = useCallback(() => {
        if (lastSpokenTextRef.current) {
            speak(lastSpokenTextRef.current);
        }
    }, [speak]);

    return {
        selectedVoiceId,
        setSelectedVoiceId,
        rate,
        setRate,
        isPlaying,
        isLoadingAudio,
        isNeuralMode,
        setIsNeuralMode,
        speak,
        replay,
        stop,
        personas: CURATED_VOICES,
    };
}
