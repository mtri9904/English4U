import type { CreateQuestionDto, CreateQuestionGroupDto } from '@/features/exams/types/exam.types';
import {
    QUESTION_TYPES,
    COMPLEX_LAYOUT_GROUP_TYPES,
    TABLE_LAYOUT_GROUP_TYPES,
    getOptionsForType,
    emptyOption,
    emptyQuestion,
} from './examEditor.helpers';
import { splitCorrectAnswers, joinCorrectAnswers } from './AlternativeAnswersInput';

export const MULTI_CORRECT_MATCHING_TYPES = new Set<string>([
    QUESTION_TYPES.MATCHING_INFO,
    QUESTION_TYPES.MATCHING_FEATURES,
    QUESTION_TYPES.MATCHING_TABLE,
]);

export const FIXED_OPTION_MATCHING_TYPES = new Set<string>([
    QUESTION_TYPES.MATCHING_CLASSIFICATION,
]);

export const remapCorrectAnswerTokens = (
    value: string | undefined,
    mapper: (token: string) => string | null | undefined,
) => {
    const remapped = splitCorrectAnswers(value)
        .map((token) => mapper(token))
        .filter((token): token is string => !!token && token.trim().length > 0);

    return joinCorrectAnswers(remapped);
};

export const buildBlankOptions = (count: number, existingOptions: CreateQuestionDto['options'] = []) =>
    Array.from({ length: count }, (_, index) => ({
        ...(existingOptions[index] ?? emptyOption(index)),
        orderIndex: index,
    }));

export const getSharedQuestionOptions = (group: CreateQuestionGroupDto) =>
    group.questions.find((question) => question.options.length > 0)?.options ?? [];

export const applySharedOptionsToQuestions = (
    questions: CreateQuestionDto[],
    nextOptions: CreateQuestionDto['options'],
) => {
    const normalizedOptions = nextOptions.map((option, index) => ({
        ...option,
        orderIndex: index,
    }));

    return questions.map((question) => ({
        ...question,
        options: normalizedOptions,
    }));
};

export const closeActiveSelectDropdown = () => {
    requestAnimationFrame(() => {
        const active = document.activeElement;
        if (active instanceof HTMLElement) {
            active.blur();
        }
    });
};

export const isFlowchartLikeType = (groupType?: string | null) =>
    groupType === QUESTION_TYPES.FLOWCHART_COMPLETION || groupType === QUESTION_TYPES.ORDERING_INFORMATION;

export const applyGroupTypeToQuestions = (
    questions: CreateQuestionDto[],
    groupType: string | undefined,
    skill: 'Reading' | 'Listening',
) => {
    const defaultOptions = getOptionsForType(groupType, skill);
    const hasDefaultOptions = defaultOptions.length > 0;
    const isPresetType = groupType === QUESTION_TYPES.TFNG || groupType === QUESTION_TYPES.YNNG;

    return questions.map((question) => {
        if (!hasDefaultOptions) {
            return { ...question, options: [] };
        }

        if (isPresetType || question.options.length === 0) {
            return {
                ...question,
                options: defaultOptions.map((option) => ({ ...option })),
            };
        }

        return question;
    });
};

export const extractTemplateQuestionNumbers = (contentData?: string) => {
    if (!contentData) return [];

    const matches = [...contentData.matchAll(/\[Q(\d+)\]/g)];
    const uniqueNumbers = new Set<number>();

    matches.forEach((match) => {
        uniqueNumbers.add(Number.parseInt(match[1], 10));
    });

    return Array.from(uniqueNumbers);
};

export const normalizeSingleQuestionToken = (value: string, questionNumber: number) => {
    const token = `[Q${questionNumber}]`;
    let hasToken = false;

    return value.replace(/\[Q\d+\]/g, () => {
        if (hasToken) {
            return '';
        }
        hasToken = true;
        return token;
    });
};

export const hasQuestionToken = (value?: string | null) => /\[Q\d+\]/.test(value ?? '');

export const getTemplatePlaceholder = (groupType?: string) => {
    if (groupType === QUESTION_TYPES.SENTENCE_COMPLETION) {
        return 'Nhập câu/đoạn và chèn [Q1], [Q2] tại vị trí cần điền.';
    }
    if (groupType === QUESTION_TYPES.SUMMARY_COMPLETION) {
        return 'Nhập đoạn summary và chèn [Q1], [Q2]... vào các chỗ trống.';
    }
    if (groupType === QUESTION_TYPES.FLOWCHART_COMPLETION) {
        return 'Nhập các dòng mô tả dưới flowchart rồi chèn [Q1], [Q2] tại vị trí cần điền.';
    }
    if (groupType === QUESTION_TYPES.ORDERING_INFORMATION) {
        return 'Ordering Information dùng ảnh sơ đồ + answer bank A-F, không cần template text.';
    }
    return 'Nội dung template (Ví dụ: [Q1] is a good [Q2])';
};

export const hasMultiSelectLayout = (contentData?: string): boolean => {
    if (!contentData) return false;

    try {
        const parsed = JSON.parse(contentData);
        if (!parsed || typeof parsed !== 'object') return false;
        return (parsed as { layout?: string }).layout === 'listening_multi_select';
    } catch {
        return false;
    }
};

export const getFlowchartAnswerMode = (
    groupType?: string,
    assetsData?: string,
): 'text_input' | 'shared_option_bank' => {
    if (groupType === QUESTION_TYPES.ORDERING_INFORMATION) {
        return 'shared_option_bank';
    }

    if (!assetsData) return 'text_input';

    try {
        const parsed = JSON.parse(assetsData) as unknown;
        if (parsed && typeof parsed === 'object') {
            const answerMode = (parsed as { answerMode?: unknown }).answerMode;
            if (answerMode === 'shared_option_bank') {
                return 'shared_option_bank';
            }
        }
    } catch {
        // Ignore parse errors and fall back to text input.
    }

    return 'text_input';
};

export const buildMultiSelectContentData = (prompt = '') =>
    JSON.stringify({
        layout: 'listening_multi_select',
        prompt,
    });

export const parseGroupAssetsData = (assetsData?: string | null) => {
    if (!assetsData) return {} as Record<string, unknown>;

    try {
        const parsed = JSON.parse(assetsData) as unknown;
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : {};
    } catch {
        return {};
    }
};

export const getListeningMcqOptionInputMode = (
    assetsData: string | null | undefined,
    questionKey: string,
): 'text' | 'image' => {
    const parsed = parseGroupAssetsData(assetsData);
    const mcqModes = parsed.listeningMcqOptionInputModes as Record<string, unknown> | undefined;
    const mode = mcqModes?.[questionKey];
    return mode === 'image' ? 'image' : 'text';
};

export const transitionGroupType = ({
    value,
    group,
    groupStartNum,
    skill,
}: {
    value: string;
    group: CreateQuestionGroupDto;
    groupStartNum: number;
    skill: 'Reading' | 'Listening';
}): Partial<CreateQuestionGroupDto> => {
    const previousType = group.groupType ?? '';
    const previousIsComplex = COMPLEX_LAYOUT_GROUP_TYPES.has(previousType);
    const nextIsComplex = COMPLEX_LAYOUT_GROUP_TYPES.has(value);
    const previousIsTable = TABLE_LAYOUT_GROUP_TYPES.has(previousType);
    const nextIsTable = TABLE_LAYOUT_GROUP_TYPES.has(value);
    const previousIsFlowchart = isFlowchartLikeType(previousType);
    const nextIsFlowchart = isFlowchartLikeType(value);
    const previousIsMapLabelling = previousType === QUESTION_TYPES.MAP_LABELLING;
    const nextIsMapLabelling = value === QUESTION_TYPES.MAP_LABELLING;
    const nextIsSharedMultiSelect = value === QUESTION_TYPES.MCQ_CHOOSE_N;
    const nextIsMultiQuestionMulti = value === QUESTION_TYPES.MCQ_MULTIPLE;
    const previousIsStructuredLayout = previousIsTable;
    const nextIsStructuredLayout = nextIsTable;

    let nextQuestions = applyGroupTypeToQuestions(group.questions, value, skill);
    let nextContentData = group.contentData;
    let nextAssetsData = group.assetsData;

    if (value === QUESTION_TYPES.MATCHING_CLASSIFICATION && previousType !== value) {
        const classificationOptions = getOptionsForType(value, skill);
        const baseQuestions =
            nextQuestions.length > 0
                ? nextQuestions
                : [{ ...emptyQuestion(), questionNumber: groupStartNum, options: classificationOptions }];
        nextQuestions = baseQuestions.map((question, index) => ({
            ...question,
            questionNumber: question.questionNumber ?? groupStartNum + index,
            options: classificationOptions.map((option) => ({ ...option })),
        }));
    }

    if (nextIsComplex && !previousIsComplex) {
        nextQuestions = [];
    }

    if (!nextIsComplex) {
        nextContentData = undefined;
    } else if (previousIsStructuredLayout && !nextIsStructuredLayout) {
        nextContentData = '';
        nextQuestions = [];
    } else if (!previousIsStructuredLayout && nextIsStructuredLayout) {
        nextContentData = undefined;
        nextQuestions = [];
    }

    if (!nextIsComplex && previousIsComplex && nextQuestions.length === 0) {
        nextQuestions = [
            {
                ...emptyQuestion(),
                options: getOptionsForType(value, skill),
            },
        ];
    }

    if (nextIsFlowchart) {
        nextContentData = previousIsFlowchart ? (group.contentData ?? '') : '';
        nextAssetsData = previousIsFlowchart ? nextAssetsData : undefined;
        const baseFlowchartQuestions = previousIsFlowchart
            ? nextQuestions
            : value === QUESTION_TYPES.ORDERING_INFORMATION
              ? Array.from({ length: 5 }, (_, index) => ({
                    ...emptyQuestion(),
                    questionNumber: groupStartNum + index,
                    options: [],
                    content: '',
                }))
              : [];
        nextQuestions = baseFlowchartQuestions.map((question, index) => ({
            ...question,
            questionNumber: question.questionNumber ?? groupStartNum + index,
            options: [],
            content: '',
        }));
    }

    if (nextIsMapLabelling) {
        const mapOptions = getOptionsForType(value, skill);
        if (nextQuestions.length === 0) {
            nextQuestions = [
                {
                    ...emptyQuestion(),
                    options: mapOptions,
                },
            ];
        } else {
            nextQuestions = nextQuestions.map((question) => ({
                ...question,
                options: previousIsMapLabelling && question.options.length > 0 ? question.options : mapOptions,
            }));
        }
        nextContentData = undefined;
        nextAssetsData = previousIsMapLabelling ? nextAssetsData : undefined;
    }

    if (!nextIsMapLabelling && previousIsMapLabelling) {
        nextAssetsData = undefined;
    }

    if (!nextIsFlowchart && previousIsFlowchart) {
        nextAssetsData = undefined;
    }

    if (nextIsMultiQuestionMulti) {
        const baseQuestions =
            nextQuestions.length > 0
                ? nextQuestions
                : [{ ...emptyQuestion(), questionNumber: groupStartNum, options: getOptionsForType(value, skill) }];
        nextQuestions = baseQuestions.map((question, index) => ({
            ...question,
            questionNumber: question.questionNumber ?? groupStartNum + index,
            options: question.options.length > 0 ? question.options : getOptionsForType(value, skill),
        }));
        nextContentData = undefined;
    }

    if (nextIsSharedMultiSelect) {
        const baseQuestions =
            nextQuestions.length > 0
                ? nextQuestions
                : [{ ...emptyQuestion(), questionNumber: groupStartNum, options: getOptionsForType(value, skill) }];
        nextQuestions = baseQuestions.map((question, index) => ({
            ...question,
            content: '',
            questionNumber: question.questionNumber ?? groupStartNum + index,
            options: question.options.length > 0 ? question.options : getOptionsForType(value, skill),
        }));
        nextContentData = hasMultiSelectLayout(group.contentData)
            ? group.contentData
            : buildMultiSelectContentData('');
    }

    return {
        groupType: value,
        contentData: nextContentData,
        assetsData: nextAssetsData,
        optionLabelType:
            value === QUESTION_TYPES.ORDERING_INFORMATION
                ? 'alpha'
                : nextIsFlowchart
                  ? undefined
                  : group.optionLabelType,
        questions: nextQuestions,
    };
};

