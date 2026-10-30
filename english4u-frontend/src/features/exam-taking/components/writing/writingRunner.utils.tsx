import type { PracticeSessionDto } from '../../types/session.types';
import { extractWritingTaskImageUrls } from '@/shared/lib/writingTaskAssets';
import {
    normalizeDisplayText,
    normalizeMarkdownBoldText,
    normalizeBlockMarkdownText,
} from '@/shared/utils/markdown.utils';

export const WRITING_SUBMIT_MIN_WORDS = 10;

export { normalizeDisplayText, normalizeMarkdownBoldText, normalizeBlockMarkdownText };

export const markdownComponents = {
    p: ({ children }: any) => <p style={{ margin: '0 0 12px', color: '#1e293b', lineHeight: 1.78 }}>{children}</p>,
    h1: ({ children }: any) => <h1 style={{ margin: '0 0 14px', color: '#0f172a', fontSize: 26 }}>{children}</h1>,
    h2: ({ children }: any) => <h2 style={{ margin: '0 0 12px', color: '#0f172a', fontSize: 22 }}>{children}</h2>,
    h3: ({ children }: any) => <h3 style={{ margin: '0 0 10px', color: '#0f172a', fontSize: 18 }}>{children}</h3>,
    strong: ({ children }: any) => <strong style={{ color: '#0f172a' }}>{children}</strong>,
    ul: ({ children }: any) => <ul style={{ margin: '0 0 12px 20px', padding: 0, color: '#1e293b', lineHeight: 1.75 }}>{children}</ul>,
    ol: ({ children }: any) => <ol style={{ margin: '0 0 12px 20px', padding: 0, color: '#1e293b', lineHeight: 1.75 }}>{children}</ol>,
};

export const countWords = (value?: string | null) => {
    const trimmed = (value ?? '').trim();
    if (!trimmed) {
        return 0;
    }

    return trimmed.split(/\s+/).filter(Boolean).length;
};

export const parseWritingAssets = (assetsData?: string | null) => {
    return extractWritingTaskImageUrls(assetsData);
};

export const buildInitialWritingAnswers = (session?: PracticeSessionDto | null) => {
    if (!session) {
        return {};
    }

    return session.answers.reduce<Record<string, string>>((accumulator, answer) => {
        if (answer.writingTaskId && answer.answerText) {
            accumulator[answer.writingTaskId] = answer.answerText;
        }
        return accumulator;
    }, {});
};

