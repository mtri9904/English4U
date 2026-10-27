export type ListeningAttemptMode = 'mock' | 'practice';

interface ListeningSessionState {
    mode: ListeningAttemptMode;
    audioPositionSeconds: number;
    updatedAt: string;
}

const STORAGE_KEY_PREFIX = 'english4u:listening-session:';

const getStorageKey = (sessionId: string) => `${STORAGE_KEY_PREFIX}${sessionId}`;

const normalizeMode = (value?: string | null): ListeningAttemptMode =>
    value === 'mock' ? 'mock' : 'practice';

const readState = (sessionId: string): ListeningSessionState | null => {
    if (!sessionId || typeof window === 'undefined') {
        return null;
    }

    try {
        const rawValue = window.localStorage.getItem(getStorageKey(sessionId));
        if (!rawValue) {
            return null;
        }

        const parsed = JSON.parse(rawValue) as Partial<ListeningSessionState> | null;
        if (!parsed || typeof parsed !== 'object') {
            return null;
        }

        return {
            mode: normalizeMode(parsed.mode),
            audioPositionSeconds:
                typeof parsed.audioPositionSeconds === 'number' && Number.isFinite(parsed.audioPositionSeconds)
                    ? Math.max(0, parsed.audioPositionSeconds)
                    : 0,
            updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
        };
    } catch {
        return null;
    }
};

const writeState = (sessionId: string, state: ListeningSessionState) => {
    if (!sessionId || typeof window === 'undefined') {
        return;
    }

    try {
        window.localStorage.setItem(getStorageKey(sessionId), JSON.stringify(state));
    } catch {
        // Ignore quota/storage errors to keep runner resilient.
    }
};

export const getListeningAttemptMode = (sessionId: string): ListeningAttemptMode =>
    readState(sessionId)?.mode ?? 'practice';

export const setListeningAttemptMode = (sessionId: string, mode: ListeningAttemptMode) => {
    const currentState = readState(sessionId);
    writeState(sessionId, {
        mode: normalizeMode(mode),
        audioPositionSeconds: currentState?.audioPositionSeconds ?? 0,
        updatedAt: new Date().toISOString(),
    });
};

export const getListeningAudioPositionSeconds = (sessionId: string) =>
    readState(sessionId)?.audioPositionSeconds ?? 0;

export const setListeningAudioPositionSeconds = (sessionId: string, seconds: number) => {
    const currentState = readState(sessionId);
    writeState(sessionId, {
        mode: currentState?.mode ?? 'practice',
        audioPositionSeconds: Number.isFinite(seconds) ? Math.max(0, seconds) : 0,
        updatedAt: new Date().toISOString(),
    });
};

export const getListeningResumePositionSeconds = (sessionId: string) =>
    Math.max(0, getListeningAudioPositionSeconds(sessionId) - 10);

export const clearListeningSessionState = (sessionId: string) => {
    if (!sessionId || typeof window === 'undefined') {
        return;
    }

    try {
        window.localStorage.removeItem(getStorageKey(sessionId));
    } catch {
        // Ignore quota/storage errors to keep runner resilient.
    }
};
