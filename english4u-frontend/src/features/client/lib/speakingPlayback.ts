export type SpeakingVisemeCode = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'X';

export interface SpeakingVisemeCue {
    code: SpeakingVisemeCode;
    startMs: number;
    endMs: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const normalizeWord = (value: string) => value.replace(/[^a-z']/gi, '').toLowerCase();

const countWords = (value?: string | null) => {
    if (!value?.trim()) {
        return 0;
    }

    return (value.match(/\S+/g) ?? []).length;
};

const toVisemeCode = (chunk: string): SpeakingVisemeCode => {
    const normalized = chunk.toLowerCase();

    if (!normalized) {
        return 'X';
    }

    if (/^(m|b|p)/.test(normalized)) {
        return 'B';
    }

    if (/^(f|v|ph)/.test(normalized)) {
        return 'G';
    }

    if (/^(th)/.test(normalized)) {
        return 'D';
    }

    if (/^(r|l|er|ir|ur)/.test(normalized)) {
        return 'E';
    }

    if (/^(oo|ou|ow|o|u|w)/.test(normalized)) {
        return 'F';
    }

    if (/^(ee|ea|ei|i|y|e)/.test(normalized)) {
        return 'C';
    }

    if (/^(a|ai|au)/.test(normalized)) {
        return 'A';
    }

    return 'H';
};

const splitWordToChunks = (value: string) => {
    const normalized = normalizeWord(value);
    if (!normalized) {
        return [];
    }

    return normalized.match(/th|sh|ch|ph|wh|ee|ea|oo|ou|ow|[aeiouy]+|[bcdfghjklmnpqrstvwxyz]+/g) ?? [normalized];
};

export const estimateSpeechDurationMs = (text?: string | null, rate = 1) => {
    const wordCount = countWords(text);
    if (wordCount === 0) {
        return 1_800;
    }

    const normalizedRate = clamp(rate, 0.6, 1.5);
    const baseWordsPerMinute = 145 * normalizedRate;
    const durationMs = (wordCount / baseWordsPerMinute) * 60_000;
    return Math.round(clamp(durationMs, 1_800, 12_000));
};

export const buildApproximateVisemeTimeline = (text?: string | null, preferredDurationMs?: number | null): SpeakingVisemeCue[] => {
    const words = (text ?? '')
        .split(/\s+/g)
        .map(normalizeWord)
        .filter(Boolean);

    const totalDurationMs = Math.round(clamp(preferredDurationMs ?? estimateSpeechDurationMs(text), 1_200, 15_000));
    if (words.length === 0) {
        return [{ code: 'X', startMs: 0, endMs: totalDurationMs }];
    }

    const leadInMs = Math.round(Math.min(180, totalDurationMs * 0.08));
    const tailOutMs = Math.round(Math.min(160, totalDurationMs * 0.06));
    const gapMs = clamp(Math.round(totalDurationMs / Math.max(words.length * 6, 24)), 20, 52);
    const totalGapMs = gapMs * Math.max(0, words.length - 1);
    const speechBodyMs = Math.max(600, totalDurationMs - leadInMs - tailOutMs - totalGapMs);
    const totalWeight = words.reduce((sum, word) => sum + Math.max(1, word.length), 0);

    const cues: SpeakingVisemeCue[] = [];
    let cursor = 0;

    if (leadInMs > 0) {
        cues.push({ code: 'X', startMs: 0, endMs: leadInMs });
        cursor = leadInMs;
    }

    words.forEach((word, index) => {
        const wordWeight = Math.max(1, word.length);
        const wordDurationMs = Math.max(120, Math.round((speechBodyMs * wordWeight) / totalWeight));
        const chunks = splitWordToChunks(word);
        const chunkDurationMs = Math.max(70, Math.round(wordDurationMs / Math.max(1, chunks.length)));

        chunks.forEach((chunk, chunkIndex) => {
            const startMs = cursor;
            const endMs = Math.min(totalDurationMs, startMs + chunkDurationMs);
            cues.push({
                code: toVisemeCode(chunk),
                startMs,
                endMs: chunkIndex === chunks.length - 1 ? Math.max(endMs, startMs + Math.round(chunkDurationMs * 0.85)) : endMs,
            });
            cursor = endMs;
        });

        if (index < words.length - 1) {
            cues.push({
                code: 'X',
                startMs: cursor,
                endMs: Math.min(totalDurationMs, cursor + gapMs),
            });
            cursor += gapMs;
        }
    });

    if (cursor < totalDurationMs) {
        cues.push({
            code: 'X',
            startMs: cursor,
            endMs: totalDurationMs,
        });
    }

    return cues.reduce<SpeakingVisemeCue[]>((result, cue) => {
        const previousCue = result[result.length - 1];
        if (previousCue && previousCue.code === cue.code && previousCue.endMs >= cue.startMs) {
            previousCue.endMs = Math.max(previousCue.endMs, cue.endMs);
            return result;
        }

        result.push({
            code: cue.code,
            startMs: cue.startMs,
            endMs: Math.max(cue.endMs, cue.startMs + 40),
        });
        return result;
    }, []);
};

export const scaleVisemeTimeline = (timeline: SpeakingVisemeCue[], targetDurationMs: number): SpeakingVisemeCue[] => {
    if (timeline.length === 0 || !Number.isFinite(targetDurationMs) || targetDurationMs <= 0) {
        return timeline;
    }

    const sourceDurationMs = timeline[timeline.length - 1]?.endMs ?? 0;
    if (sourceDurationMs <= 0 || sourceDurationMs === targetDurationMs) {
        return timeline;
    }

    const ratio = targetDurationMs / sourceDurationMs;
    return timeline.map((cue, index) => {
        const startMs = Math.round(cue.startMs * ratio);
        const endMs = index === timeline.length - 1
            ? targetDurationMs
            : Math.max(startMs + 40, Math.round(cue.endMs * ratio));
        return {
            code: cue.code,
            startMs,
            endMs,
        };
    });
};

export const resolveVisemeAtTime = (timeline: SpeakingVisemeCue[], elapsedMs: number): SpeakingVisemeCode => {
    const cue = timeline.find((item) => elapsedMs >= item.startMs && elapsedMs < item.endMs);
    return cue?.code ?? timeline[timeline.length - 1]?.code ?? 'X';
};

const visemePhaseMap: Record<SpeakingVisemeCode, number> = {
    A: 0.2,
    B: 1.3,
    C: 2.2,
    D: 2.8,
    E: 3.4,
    F: 4.1,
    G: 4.8,
    H: 5.6,
    X: 0,
};

const visemeBaseLevelMap: Record<SpeakingVisemeCode, number> = {
    A: 0.72,
    B: 0.16,
    C: 0.6,
    D: 0.44,
    E: 0.48,
    F: 0.52,
    G: 0.34,
    H: 0.4,
    X: 0.06,
};

export const buildSyntheticLevel = (viseme: SpeakingVisemeCode, elapsedMs: number) => {
    const base = visemeBaseLevelMap[viseme];
    if (viseme === 'X') {
        return base;
    }

    const pulse = (Math.sin(elapsedMs / 90 + visemePhaseMap[viseme]) + 1) * 0.12;
    return clamp(base + pulse, 0.08, 0.96);
};

export const countSpokenWords = countWords;

export const estimateWordsPerMinute = (text?: string | null, durationSeconds?: number | null) => {
    const wordCount = countWords(text);
    if (wordCount === 0 || durationSeconds == null || durationSeconds <= 0) {
        return null;
    }

    return Math.round((wordCount / durationSeconds) * 60);
};
