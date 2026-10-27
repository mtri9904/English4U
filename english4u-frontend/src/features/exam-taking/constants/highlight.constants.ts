import type { PracticeSessionHighlightColor } from '../types/session.types';

export type RunnerHighlightColor = PracticeSessionHighlightColor;

export type RunnerHighlight = {
    id: string;
    sourceKey: string;
    startOffset: number;
    endOffset: number;
    selectedText: string;
    color: RunnerHighlightColor;
    createdAt: string;
    updatedAt: string;
};

export type RunnerHighlightPatch = Omit<RunnerHighlight, 'id' | 'createdAt' | 'updatedAt'>;

export type HighlightableProps = {
    highlights?: RunnerHighlight[];
    onCreateHighlight?: (highlight: RunnerHighlightPatch) => void;
    onDeleteHighlight?: (highlightId: string) => void;
};

export const HIGHLIGHT_STORAGE_VERSION = 1;

export const HIGHLIGHT_COLOR_STYLES: Record<RunnerHighlightColor, { background: string; border: string }> = {
    yellow: { background: 'rgba(250, 204, 21, 0.45)', border: '#facc15' },
    green: { background: 'rgba(134, 239, 172, 0.45)', border: '#86efac' },
    blue: { background: 'rgba(147, 197, 253, 0.48)', border: '#93c5fd' },
    pink: { background: 'rgba(249, 168, 212, 0.48)', border: '#f9a8d4' },
    purple: { background: 'rgba(196, 181, 253, 0.48)', border: '#c4b5fd' },
};

export const HIGHLIGHT_COLOR_OPTIONS: RunnerHighlightColor[] = ['yellow', 'green', 'blue', 'pink', 'purple'];

// Backward compatibility aliases
export const highlightColorStyles = HIGHLIGHT_COLOR_STYLES;
export const highlightColorOptions = HIGHLIGHT_COLOR_OPTIONS;

