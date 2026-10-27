import type {
    PracticeSessionDto,
    PracticeSessionSpeakingQuestionDto,
} from '../types/session.types';

export type SpeakingPromptEntry = {
    sectionTitle: string | null;
    partId: string;
    partNumber: number | null;
    partDescription: string | null;
    question: PracticeSessionSpeakingQuestionDto;
    promptIndex: number;
    globalIndex: number;
};

export const normalizeCueCardPoints = (value?: string | null) =>
    (value ?? '')
        .split(/\r?\n|•/g)
        .map((item) => item.replace(/^[\s\-–•]+/, '').trim())
        .filter(Boolean);

export const formatSeconds = (value?: number | null) => {
    if (value == null) {
        return 'Không giới hạn';
    }

    const total = Math.max(0, value);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export const getRecordingLimitSeconds = (partNumber?: number | null) => {
    if (partNumber === 2) {
        return 120;
    }

    if (partNumber === 1) {
        return 45;
    }

    return 90;
};

export const hasPreparationStep = (entry?: SpeakingPromptEntry | null) =>
    entry?.partNumber === 2 && entry?.promptIndex === 1;

export const getPreparationLimitSeconds = (entry?: SpeakingPromptEntry | null) =>
    hasPreparationStep(entry) ? 60 : 0;

export const getAnalyticsTagColor = (label?: string | null) => {
    switch (label) {
        case 'balanced':
        case 'on_target':
            return 'success';
        case 'fast':
            return 'processing';
        case 'slow':
        case 'too_short':
        case 'very_fast':
        case 'exceeds_target':
            return 'warning';
        default:
            return 'default';
    }
};

export const getSpeakingPromptEntries = (session?: PracticeSessionDto | null): SpeakingPromptEntry[] => {
    if (!session) {
        return [];
    }

    let globalIndex = 0;
    return session.exam.sections.flatMap((section) =>
        section.speakingParts.flatMap((part) =>
            [...part.questions]
                .sort((left, right) => (left.orderIndex ?? 0) - (right.orderIndex ?? 0))
                .map((question, index) => {
                    globalIndex += 1;
                    return {
                        sectionTitle: section.title,
                        partId: part.id,
                        partNumber: part.partNumber,
                        partDescription: part.description,
                        question,
                        promptIndex: index + 1,
                        globalIndex,
                    };
                }),
        ),
    );
};

export const buildSpeakingAnswerMap = (session?: PracticeSessionDto | null) =>
    new Map(
        (session?.answers ?? [])
            .filter((answer) => !!answer.speakingQuestionId)
            .map((answer) => [answer.speakingQuestionId!, answer]),
    );

export const getNextPromptQuestionId = (entries: SpeakingPromptEntry[], questionId: string) => {
    const currentPromptIndex = entries.findIndex((entry) => entry.question.id === questionId);
    return currentPromptIndex >= 0 ? entries[currentPromptIndex + 1]?.question.id ?? null : null;
};

