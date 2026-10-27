import { useEffect, useRef } from 'react';
import { message } from 'antd';
import type { CopilotReplayAction } from '../types/copilot.types';

export const useCopilotAudioReplay = (skillType: string, sharedListeningAudioUrl?: string | null) => {
    const reviewListeningAudioRef = useRef<HTMLAudioElement | null>(null);
    const replayStopAtRef = useRef<number | null>(null);

    useEffect(() => {
        if (skillType !== 'LISTENING') {
            replayStopAtRef.current = null;
            return;
        }

        const audioElement = reviewListeningAudioRef.current;
        if (!audioElement) {
            return;
        }

        const handleTimeUpdate = () => {
            const stopAtSecond = replayStopAtRef.current;
            if (stopAtSecond == null || audioElement.currentTime < stopAtSecond) {
                return;
            }

            replayStopAtRef.current = null;
            audioElement.pause();
        };

        audioElement.addEventListener('timeupdate', handleTimeUpdate);
        return () => audioElement.removeEventListener('timeupdate', handleTimeUpdate);
    }, [sharedListeningAudioUrl, skillType]);

    const handlePlayReplayAction = (action: CopilotReplayAction) => {
        const audioElement = reviewListeningAudioRef.current;
        if (!audioElement) {
            message.warning('Audio review chưa sẵn sàng để phát lại.');
            return;
        }

        const seekAndPlay = () => {
            replayStopAtRef.current = action.endAtSecond != null && action.endAtSecond > action.playAtSecond
                ? action.endAtSecond + 0.05
                : null;
            audioElement.currentTime = Math.max(0, action.playAtSecond);

            const playPromise = audioElement.play();
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch(() => {
                    message.warning('Trình duyệt chặn tự phát audio. Bạn bấm "Nghe lại đoạn này" thêm một lần để phát.');
                });
            }
        };

        if (audioElement.readyState >= 1) {
            seekAndPlay();
            return;
        }

        const handleLoadedMetadata = () => {
            audioElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
            seekAndPlay();
        };

        audioElement.addEventListener('loadedmetadata', handleLoadedMetadata);
        audioElement.load();
    };

    return {
        reviewListeningAudioRef,
        handlePlayReplayAction,
    };
};

