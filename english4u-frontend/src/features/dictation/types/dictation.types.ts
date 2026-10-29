export type DictationFormat = 'sentences' | 'paragraph' | 'cloze';
export type DictationTopic = 'daily' | 'business' | 'travel' | 'academic' | 'custom';
export type DictationLevel = 'easy' | 'medium' | 'hard';

export interface DictationClozeToken {
    word: string;
    isMasked: boolean;
    hint?: string | null;
}

export interface DictationItem {
    id: number;
    sentence: string;
    translation: string;
    blindSpots: string[];
    clozeTokens?: DictationClozeToken[] | null;
    focusWord?: string | null;
    focusWordDefinition?: string | null;
}

export interface DictationExercise {
    format: DictationFormat;
    topic: string;
    level: DictationLevel;
    title: string;
    fullParagraph?: string | null;
    fullTranslation?: string | null;
    items: DictationItem[];
}

export interface DictationGenerateRequest {
    format: DictationFormat;
    topic: string;
    level: DictationLevel;
    count: number;
}

export type DiffStatus = 'correct' | 'incorrect' | 'blindspot' | 'missing' | 'extra';

export interface DiffToken {
    id: string;
    word: string;
    targetWord?: string;
    status: DiffStatus;
    suggestion?: string;
    isBlindSpot?: boolean;
}

export interface SentenceEvaluation {
    tokens: DiffToken[];
    accuracyPercent: number;
    isComplete: boolean;
    correctCount: number;
    incorrectCount: number;
    blindSpotMissCount: number;
    totalTargetWords: number;
}

export interface VoicePersona {
    id: string;
    name: string;
    accent: 'US' | 'UK' | 'AU' | 'CA' | 'IE' | 'IN' | string;
    flag: string;
    gender: 'female' | 'male';
    description: string;
}

