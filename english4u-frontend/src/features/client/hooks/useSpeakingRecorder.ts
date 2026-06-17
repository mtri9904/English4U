import { useCallback, useEffect, useRef, useState } from 'react';

type RecorderPermissionState = 'idle' | 'granted' | 'denied' | 'unsupported';

export interface SpeakingRecordingResult {
    blob: Blob;
    previewUrl: string;
    durationSeconds: number;
    mimeType: string;
    fileSizeKB: number;
}

interface StartRecordingOptions {
    maxDurationSeconds: number;
}

const hasUsableAudioTrack = (stream: MediaStream | null) => (
    !!stream
    && stream.active
    && stream.getAudioTracks().some((track) => track.readyState === 'live')
);

const stopMediaStream = (stream: MediaStream | null) => {
    stream?.getTracks().forEach((track) => track.stop());
};

const getPreferredMimeType = () => {
    if (typeof MediaRecorder === 'undefined') {
        return '';
    }

    const candidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
    ];

    return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? '';
};

const toRecorderErrorMessage = (error: unknown) => {
    if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError') {
            return 'Trình duyệt đang chặn quyền microphone. Hãy cho phép mic rồi thử lại.';
        }

        if (error.name === 'NotFoundError') {
            return 'Không tìm thấy microphone khả dụng trên thiết bị này.';
        }

        if (error.name === 'NotSupportedError') {
            return 'Trình duyệt hiện tại không khởi động được MediaRecorder cho microphone này. Hãy thử lại bằng Chrome hoặc Edge mới nhất.';
        }

        if (error.name === 'InvalidStateError') {
            return 'MediaRecorder đang ở trạng thái không hợp lệ. Hãy tải lại trang rồi thử lại.';
        }

        if (error.name === 'SecurityError') {
            return 'Trình duyệt hoặc môi trường hiện tại không cho phép ghi âm microphone.';
        }
    }

    if (error instanceof Error && error.message) {
        return error.message;
    }

    return 'Không thể khởi tạo microphone.';
};

export const useSpeakingRecorder = () => {
    const streamRef = useRef<MediaStream | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<BlobPart[]>([]);
    const startedAtRef = useRef<number | null>(null);
    const stopTimerRef = useRef<number | null>(null);
    const elapsedIntervalRef = useRef<number | null>(null);
    const stopResolverRef = useRef<((value: SpeakingRecordingResult | null) => void) | null>(null);
    const rafRef = useRef<number | null>(null);
    const isStartingRef = useRef(false);

    const [permissionState, setPermissionState] = useState<RecorderPermissionState>('idle');
    const [streamVersion, setStreamVersion] = useState(0);
    const [audioLevel, setAudioLevel] = useState(0);
    const [isRecording, setIsRecording] = useState(false);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [lastRecording, setLastRecording] = useState<SpeakingRecordingResult | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const clearStopTimer = useCallback(() => {
        if (stopTimerRef.current != null) {
            window.clearTimeout(stopTimerRef.current);
            stopTimerRef.current = null;
        }
    }, []);

    const clearElapsedInterval = useCallback(() => {
        if (elapsedIntervalRef.current != null) {
            window.clearInterval(elapsedIntervalRef.current);
            elapsedIntervalRef.current = null;
        }
    }, []);

    const resetRecorderState = useCallback(() => {
        clearStopTimer();
        clearElapsedInterval();
        mediaRecorderRef.current = null;
        chunksRef.current = [];
        startedAtRef.current = null;
        stopResolverRef.current = null;
        setIsRecording(false);
        setElapsedSeconds(0);
    }, [clearElapsedInterval, clearStopTimer]);

    const requestPermission = useCallback(async (): Promise<MediaStream> => {
        if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
            setPermissionState('unsupported');
            const unsupportedError = new Error('Trình duyệt hiện tại không hỗ trợ MediaRecorder.');
            setErrorMessage(unsupportedError.message);
            throw unsupportedError;
        }

        const currentStream = streamRef.current;
        if (currentStream && hasUsableAudioTrack(currentStream)) {
            setPermissionState('granted');
            return currentStream;
        }

        if (currentStream) {
            stopMediaStream(currentStream);
            streamRef.current = null;
            setStreamVersion((current) => current + 1);
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            setPermissionState('granted');
            setErrorMessage(null);
            setStreamVersion((current) => current + 1);
            return stream;
        } catch (error) {
            setPermissionState('denied');
            const nextErrorMessage = toRecorderErrorMessage(error);
            setErrorMessage(nextErrorMessage);
            throw error;
        }
    }, []);

    const finalizeRecording = useCallback((blob: Blob): SpeakingRecordingResult => {
        const durationSeconds = startedAtRef.current == null
            ? 0
            : Math.max(1, Math.round((performance.now() - startedAtRef.current) / 100) / 10);
        const previewUrl = URL.createObjectURL(blob);
        const result: SpeakingRecordingResult = {
            blob,
            previewUrl,
            durationSeconds,
            mimeType: blob.type || 'audio/webm',
            fileSizeKB: Math.max(1, Math.round(blob.size / 1024)),
        };

        setLastRecording(result);
        return result;
    }, []);

    const startRecording = useCallback(async ({ maxDurationSeconds }: StartRecordingOptions) => {
        if (isRecording || mediaRecorderRef.current || isStartingRef.current) {
            return;
        }

        isStartingRef.current = true;

        try {
            const stream = await requestPermission();
            const preferredMimeType = getPreferredMimeType();
            const mimeTypeCandidates = preferredMimeType ? [preferredMimeType, ''] : [''];
            let startedRecorder: MediaRecorder | null = null;
            let lastStartError: unknown = null;

            chunksRef.current = [];
            setElapsedSeconds(0);
            setErrorMessage(null);

            for (const candidateMimeType of mimeTypeCandidates) {
                try {
                    const recorder = candidateMimeType
                        ? new MediaRecorder(stream, { mimeType: candidateMimeType })
                        : new MediaRecorder(stream);

                    recorder.ondataavailable = (event) => {
                        if (event.data.size > 0) {
                            chunksRef.current.push(event.data);
                        }
                    };

                    recorder.onerror = (event) => {
                        const recorderError = (event as Event & { error?: DOMException }).error;
                        setErrorMessage(
                            recorderError
                                ? toRecorderErrorMessage(recorderError)
                                : 'MediaRecorder gặp lỗi trong lúc thu âm.',
                        );
                    };

                    recorder.onstop = () => {
                        clearStopTimer();
                        clearElapsedInterval();
                        setIsRecording(false);

                        const finalElapsed = startedAtRef.current == null
                            ? 0
                            : Math.floor((performance.now() - startedAtRef.current) / 1000);
                        setElapsedSeconds(finalElapsed);

                        const blob = new Blob(chunksRef.current, {
                            type: recorder.mimeType || candidateMimeType || preferredMimeType || 'audio/webm',
                        });
                        chunksRef.current = [];
                        mediaRecorderRef.current = null;

                        const result = blob.size > 0 ? finalizeRecording(blob) : null;
                        startedAtRef.current = null;
                        stopResolverRef.current?.(result);
                        stopResolverRef.current = null;
                    };

                    recorder.start();
                    mediaRecorderRef.current = recorder;
                    startedRecorder = recorder;
                    startedAtRef.current = performance.now();
                    setIsRecording(true);

                    clearElapsedInterval();
                    elapsedIntervalRef.current = window.setInterval(() => {
                        if (startedAtRef.current == null) {
                            return;
                        }

                        setElapsedSeconds(Math.floor((performance.now() - startedAtRef.current) / 1000));
                    }, 250);

                    clearStopTimer();
                    stopTimerRef.current = window.setTimeout(() => {
                        if (recorder.state !== 'inactive') {
                            recorder.stop();
                        }
                    }, Math.max(1, maxDurationSeconds) * 1000);

                    break;
                } catch (error) {
                    lastStartError = error;
                    mediaRecorderRef.current = null;

                    console.warn('Failed to start MediaRecorder', {
                        mimeType: candidateMimeType || 'browser-default',
                        error,
                        streamActive: stream.active,
                        audioTracks: stream.getAudioTracks().map((track) => ({
                            label: track.label,
                            enabled: track.enabled,
                            muted: track.muted,
                            readyState: track.readyState,
                        })),
                    });
                }
            }

            if (!startedRecorder) {
                resetRecorderState();

                if (!hasUsableAudioTrack(stream)) {
                    stopMediaStream(stream);
                    if (streamRef.current === stream) {
                        streamRef.current = null;
                        setStreamVersion((current) => current + 1);
                    }
                }

                const startErrorMessage = lastStartError != null
                    ? toRecorderErrorMessage(lastStartError)
                    : 'Microphone đã sẵn sàng nhưng MediaRecorder không khởi động được. Hãy tải lại trang hoặc thử lại bằng Chrome/Edge mới nhất.';
                const startError = new Error(startErrorMessage);
                setErrorMessage(startError.message);
                throw startError;
            }
        } finally {
            isStartingRef.current = false;
        }
    }, [clearElapsedInterval, clearStopTimer, finalizeRecording, isRecording, requestPermission, resetRecorderState]);

    const stopRecording = useCallback(async () => {
        const recorder = mediaRecorderRef.current;
        if (!recorder || recorder.state === 'inactive') {
            return null;
        }

        return await new Promise<SpeakingRecordingResult | null>((resolve) => {
            stopResolverRef.current = resolve;
            recorder.stop();
        });
    }, []);

    useEffect(() => {
        const stream = streamRef.current;
        if (!stream || typeof window === 'undefined' || typeof window.AudioContext === 'undefined') {
            setAudioLevel(0);
            return;
        }

        const audioContext = new window.AudioContext();
        void audioContext.resume().catch(() => undefined);

        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.85;

        const sourceNode = audioContext.createMediaStreamSource(stream);
        sourceNode.connect(analyser);

        const buffer = new Uint8Array(analyser.frequencyBinCount);
        const readLevel = () => {
            analyser.getByteTimeDomainData(buffer);
            let sum = 0;
            for (let index = 0; index < buffer.length; index += 1) {
                const normalized = (buffer[index] - 128) / 128;
                sum += normalized * normalized;
            }

            const rms = Math.sqrt(sum / buffer.length);
            setAudioLevel(Math.min(1, rms * 4.5));
            rafRef.current = window.requestAnimationFrame(readLevel);
        };

        readLevel();

        return () => {
            if (rafRef.current != null) {
                window.cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }

            sourceNode.disconnect();
            analyser.disconnect();
            void audioContext.close().catch(() => undefined);
        };
    }, [streamVersion]);

    useEffect(() => () => {
        clearStopTimer();
        clearElapsedInterval();
        if (rafRef.current != null) {
            window.cancelAnimationFrame(rafRef.current);
        }

        mediaRecorderRef.current?.stream.getTracks().forEach((track) => track.stop());
        streamRef.current?.getTracks().forEach((track) => track.stop());
        if (lastRecording?.previewUrl) {
            URL.revokeObjectURL(lastRecording.previewUrl);
        }
    }, [clearElapsedInterval, clearStopTimer, lastRecording?.previewUrl]);

    return {
        permissionState,
        audioLevel,
        isRecording,
        elapsedSeconds,
        lastRecording,
        errorMessage,
        requestPermission,
        startRecording,
        stopRecording,
    };
};
