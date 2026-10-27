import type { CreateQuestionGroupDto, CreateQuestionOptionDto } from '@/features/exams/types/exam.types';
import { QUESTION_TYPES } from '@/features/exams/components/questionTypes';
import { getOptionLabel } from '@/shared/utils/optionLabel.utils';
import { emptyOption } from './examEditor.helpers';

export type FlowchartAnswerMode = 'text_input' | 'shared_option_bank';
export type FlowchartTextInputLayout = 'template' | 'question_count';

export interface FlowchartAssetData {
    layout: 'flowchart_completion_image';
    imageUrl: string;
    answerMode?: FlowchartAnswerMode;
    textInputLayout?: FlowchartTextInputLayout;
}

export const MIN_ANSWER_COUNT = 1;
export const MAX_ANSWER_COUNT = 26;
export const DEFAULT_ANSWER_COUNT = 5;
export const MIN_OPTION_COUNT = 1;
export const MAX_OPTION_COUNT = 26;
export const DEFAULT_OPTION_COUNT = 6;
export const DEFAULT_ANSWER_MODE: FlowchartAnswerMode = 'text_input';
export const DEFAULT_TEXT_INPUT_LAYOUT: FlowchartTextInputLayout = 'template';

export const getDefaultAnswerMode = (groupType?: string): FlowchartAnswerMode =>
    groupType === QUESTION_TYPES.ORDERING_INFORMATION ? 'shared_option_bank' : DEFAULT_ANSWER_MODE;

export const createDefaultAssets = (groupType?: string): FlowchartAssetData => ({
    layout: 'flowchart_completion_image',
    imageUrl: '',
    answerMode: getDefaultAnswerMode(groupType),
});

export const parseFlowchartAssetsData = (assetsData?: string, groupType?: string): FlowchartAssetData => {
    const defaults = createDefaultAssets(groupType);
    if (!assetsData) return defaults;

    try {
        const parsed = JSON.parse(assetsData) as unknown;
        if (typeof parsed === 'string') {
            return { ...defaults, imageUrl: parsed };
        }

        if (parsed && typeof parsed === 'object') {
            const answerMode = (parsed as { answerMode?: unknown }).answerMode;
            const textInputLayout = (parsed as { textInputLayout?: unknown }).textInputLayout;
            const normalizedAnswerMode: FlowchartAnswerMode =
                answerMode === 'shared_option_bank' || answerMode === 'text_input'
                    ? answerMode
                    : defaults.answerMode ?? DEFAULT_ANSWER_MODE;
            const normalizedTextInputLayout: FlowchartTextInputLayout | undefined =
                textInputLayout === 'template' || textInputLayout === 'question_count'
                    ? textInputLayout
                    : undefined;

            if (typeof (parsed as { imageUrl?: unknown }).imageUrl === 'string') {
                return {
                    layout: 'flowchart_completion_image',
                    imageUrl: (parsed as { imageUrl: string }).imageUrl,
                    answerMode: normalizedAnswerMode,
                    textInputLayout: normalizedTextInputLayout,
                };
            }

            if (typeof (parsed as { url?: unknown }).url === 'string') {
                return {
                    layout: 'flowchart_completion_image',
                    imageUrl: (parsed as { url: string }).url,
                    answerMode: normalizedAnswerMode,
                    textInputLayout: normalizedTextInputLayout,
                };
            }
        }
    } catch {
        return { ...defaults, imageUrl: assetsData };
    }

    return defaults;
};

export const serializeFlowchartAssetsData = (assets: FlowchartAssetData) => JSON.stringify(assets);

export const normalizeAnswerCount = (count?: number | null) => {
    const candidate = count ?? DEFAULT_ANSWER_COUNT;
    const normalized = Number.isFinite(candidate) ? Math.trunc(candidate) : DEFAULT_ANSWER_COUNT;
    return Math.min(MAX_ANSWER_COUNT, Math.max(MIN_ANSWER_COUNT, normalized));
};

export const normalizeOptionCount = (count?: number | null) => {
    const candidate = count ?? DEFAULT_OPTION_COUNT;
    const normalized = Number.isFinite(candidate) ? Math.trunc(candidate) : DEFAULT_OPTION_COUNT;
    return Math.min(MAX_OPTION_COUNT, Math.max(MIN_OPTION_COUNT, normalized));
};

export const cloneOptions = (options: CreateQuestionOptionDto[]) => (
    options.map((option, index) => ({
        ...option,
        orderIndex: index,
    }))
);

export const createDefaultOptions = (count = DEFAULT_OPTION_COUNT): CreateQuestionOptionDto[] => (
    Array.from({ length: count }, (_, index) => emptyOption(index))
);

export const getRomanLabel = (index: number) => getOptionLabel(index, 'roman');

export const convertAnswerLabel = (
    answer: string | undefined,
    previousType: 'alpha' | 'roman',
    nextType: 'alpha' | 'roman',
    optionCount: number,
) => {
    const normalized = (answer ?? '').trim();
    if (!normalized || previousType === nextType) {
        return normalized || undefined;
    }

    if (previousType === 'alpha' && nextType === 'roman') {
        const upper = normalized.toUpperCase();
        const index = upper.charCodeAt(0) - 65;
        return index >= 0 && index < optionCount ? getRomanLabel(index) : undefined;
    }

    const lower = normalized.toLowerCase();
    for (let index = 0; index < optionCount; index += 1) {
        if (getRomanLabel(index) === lower) {
            return getOptionLabel(index, 'alpha');
        }
    }

    return undefined;
};

export const adjustAnswerForOptionCount = (
    answer: string | undefined,
    labelType: 'alpha' | 'roman',
    optionCount: number,
) => {
    const normalized = (answer ?? '').trim();
    if (!normalized) {
        return undefined;
    }

    if (labelType === 'alpha') {
        const upper = normalized.toUpperCase();
        const index = upper.charCodeAt(0) - 65;
        return index >= 0 && index < optionCount ? upper : undefined;
    }

    const lower = normalized.toLowerCase();
    for (let index = 0; index < optionCount; index += 1) {
        if (getRomanLabel(index) === lower) {
            return lower;
        }
    }

    return undefined;
};

export const extractTemplateQuestionNumbers = (contentData?: string) => {
    if (!contentData) return [];

    const matches = [...contentData.matchAll(/\[Q(\d+)\]/g)];
    const uniqueNumbers = new Set<number>();

    matches.forEach((match) => {
        uniqueNumbers.add(Number.parseInt(match[1], 10));
    });

    return Array.from(uniqueNumbers).sort((left, right) => left - right);
};

export const hasTemplateQuestionTokens = (contentData?: string) =>
    extractTemplateQuestionNumbers(contentData).length > 0;

export const inferTextInputLayout = (group: CreateQuestionGroupDto): FlowchartTextInputLayout => {
    if (hasTemplateQuestionTokens(group.contentData)) {
        return 'template';
    }

    if (!(group.contentData ?? '').trim() && group.questions.length > 0) {
        return 'question_count';
    }

    return DEFAULT_TEXT_INPUT_LAYOUT;
};

