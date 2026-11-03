import { useState, useEffect, useCallback } from 'react';
import { message } from 'antd';
import type { NewsItem } from '../types/news.types';

interface UseNewsSpeechOptions {
    open: boolean;
    displayItem: NewsItem | null;
}

export function useNewsSpeech({ open, displayItem }: UseNewsSpeechOptions) {
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [speechRate, setSpeechRate] = useState<number>(1.0);

    // Stop and cleanup speech when modal closes
    useEffect(() => {
        if (!open && typeof window !== 'undefined' && 'speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            setIsSpeaking(false);
            setIsPaused(false);
        }
    }, [open]);

    const playBrowserSpeech = useCallback((text: string) => {
        if (!('speechSynthesis' in window)) return;

        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-GB';
        utterance.rate = 0.9;

        const voices = window.speechSynthesis.getVoices();
        const britishVoice =
            voices.find((v) => v.lang.startsWith('en-GB') || (v.lang.startsWith('en') && v.name.includes('UK'))) ||
            voices.find((v) => v.lang.startsWith('en'));

        if (britishVoice) {
            utterance.voice = britishVoice;
        }
        window.speechSynthesis.speak(utterance);
    }, []);

    const playSpeech = useCallback(
        (text: string, customAudioUrl?: string) => {
            if (customAudioUrl) {
                try {
                    const audio = new Audio(customAudioUrl);
                    audio.play().catch(() => playBrowserSpeech(text));
                    return;
                } catch {
                    // Fallback to browser speech
                }
            }
            playBrowserSpeech(text);
        },
        [playBrowserSpeech]
    );

    const handleToggleSpeech = useCallback(() => {
        if (!('speechSynthesis' in window)) {
            message.warning('Trình duyệt của bạn không hỗ trợ tính năng Text-to-Speech.');
            return;
        }

        if (isSpeaking && !isPaused) {
            window.speechSynthesis.pause();
            setIsPaused(true);
            return;
        }

        if (isPaused) {
            window.speechSynthesis.resume();
            setIsPaused(false);
            return;
        }

        window.speechSynthesis.cancel();

        if (!displayItem) return;
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = displayItem.bodyHtml || displayItem.description;
        const textToRead = `${displayItem.title}. ${tempDiv.textContent || tempDiv.innerText || displayItem.description}`.slice(0, 4000);

        const utterance = new SpeechSynthesisUtterance(textToRead);
        utterance.lang = 'en-GB';
        utterance.rate = speechRate;

        const voices = window.speechSynthesis.getVoices();
        const britishVoice =
            voices.find((v) => v.lang.startsWith('en-GB') || (v.lang.startsWith('en') && v.name.includes('UK'))) ||
            voices.find((v) => v.lang.startsWith('en'));

        if (britishVoice) {
            utterance.voice = britishVoice;
        }

        utterance.onstart = () => {
            setIsSpeaking(true);
            setIsPaused(false);
        };

        utterance.onend = () => {
            setIsSpeaking(false);
            setIsPaused(false);
        };

        utterance.onerror = () => {
            setIsSpeaking(false);
            setIsPaused(false);
        };

        window.speechSynthesis.speak(utterance);
    }, [displayItem, isPaused, isSpeaking, speechRate]);

    const handleStopSpeech = useCallback(() => {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            setIsSpeaking(false);
            setIsPaused(false);
        }
    }, []);

    return {
        isSpeaking,
        isPaused,
        speechRate,
        setSpeechRate,
        playSpeech,
        handleToggleSpeech,
        handleStopSpeech,
    };
}

