import { getEffectiveMcqGroupType, inferQuestionGroupOptionLabelType } from '@/shared/lib/examDisplay';
import { getOptionLabel } from '@/shared/utils/optionLabel.utils';
import type {
    PracticeSessionQuestionDto,
    PracticeSessionQuestionGroupDto,
} from '../types/session.types';
import type { CopilotContextImagePayload } from '../types/copilot.types';

export const normalizeText = (value?: string | null) =>
    (value ?? '')
        .replace(/\\r\\n/g, '\n')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\n')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\*\*/g, '')
        .replace(/`/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

export const normalizeInlineTokenText = (value?: string | null) =>
    normalizeText(value).replace(/\[Q(\d+)\]/g, 'blank Q$1');

export const isImageUrl = (value?: string | null) => {
    const normalized = (value ?? '').trim();
    if (!normalized) {
        return false;
    }

    return /^https?:\/\/.+\.(?:png|jpe?g|webp|gif|bmp)(?:\?.*)?$/i.test(normalized);
};

export const parseAssetImageUrls = (assetsData?: string | null) => {
    if (!assetsData) {
        return [];
    }

    try {
        const parsed = JSON.parse(assetsData) as unknown;
        if (typeof parsed === 'string') {
            return isImageUrl(parsed) ? [parsed.trim()] : [];
        }

        if (Array.isArray(parsed)) {
            return parsed
                .filter((item): item is string => typeof item === 'string')
                .map((item) => item.trim())
                .filter((item) => isImageUrl(item));
        }

        if (parsed && typeof parsed === 'object') {
            const candidates = [
                (parsed as { imageUrl?: unknown }).imageUrl,
                (parsed as { url?: unknown }).url,
                (parsed as { assetUrl?: unknown }).assetUrl,
            ];

            return candidates
                .filter((item): item is string => typeof item === 'string')
                .map((item) => item.trim())
                .filter((item) => isImageUrl(item));
        }
    } catch {
        return isImageUrl(assetsData) ? [assetsData.trim()] : [];
    }

    return [];
};

export const dedupeImages = (images: CopilotContextImagePayload[]) => {
    const seen = new Set<string>();

    return images.filter((image) => {
        const normalizedUrl = image.url.trim();
        if (!normalizedUrl || seen.has(normalizedUrl)) {
            return false;
        }

        seen.add(normalizedUrl);
        return true;
    });
};

export const buildImagePayloads = (urls: string[], labelPrefix: string) =>
    urls.map((url, index) => ({
        url,
        label: `${labelPrefix} - hình ${index + 1}`,
    }));

export const sortOptions = (options?: PracticeSessionQuestionDto['options'] | null) =>
    [...(options ?? [])].sort((left, right) => {
        const leftOrder = left.orderIndex ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = right.orderIndex ?? Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder || (left.id || '').localeCompare(right.id || '');
    });

export const sortQuestions = (questions?: PracticeSessionQuestionDto[] | null) =>
    [...(questions ?? [])].sort((left, right) => {
        const leftOrder = left.questionNumber ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = right.questionNumber ?? Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder || (left.id || '').localeCompare(right.id || '');
    });

export const sortGroups = (groups?: PracticeSessionQuestionGroupDto[] | null) =>
    [...(groups ?? [])].sort((left, right) => {
        const leftOrder = left.startQuestion ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = right.startQuestion ?? Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder || (left.id || '').localeCompare(right.id || '');
    });

export const getQuestionVisualOptionUrls = (question: PracticeSessionQuestionDto) =>
    sortOptions(question.options)
        .flatMap((option) => {
            const explicitImageUrl = option.imageUrl?.trim() ?? '';
            const legacyImageUrl = option.optionText?.trim() ?? '';
            return [explicitImageUrl, legacyImageUrl];
        })
        .filter((optionUrl) => isImageUrl(optionUrl));

export const getGroupImagePayloads = (
    group: PracticeSessionQuestionGroupDto,
    labelPrefix: string,
    question?: PracticeSessionQuestionDto,
) => {
    const urls = [
        ...parseAssetImageUrls(group.assetsData),
        ...(question ? getQuestionVisualOptionUrls(question) : []),
    ];

    return buildImagePayloads(
        Array.from(new Set(urls)),
        labelPrefix,
    );
};

export const getSharedOptions = (group: PracticeSessionQuestionGroupDto) =>
    (group.questions ?? []).find((question) => (question.options?.length ?? 0) > 0)?.options ?? [];

export const extractPromptText = (group: PracticeSessionQuestionGroupDto) => {
    if (!group.contentData) {
        return '';
    }

    try {
        const parsed = JSON.parse(group.contentData) as unknown;
        if (typeof parsed === 'string') {
            return normalizeInlineTokenText(parsed);
        }

        if (Array.isArray(parsed)) {
            return normalizeInlineTokenText(
                parsed.flatMap((row) => Array.isArray(row) ? row : []).join('\n'),
            );
        }

        if (parsed && typeof parsed === 'object') {
            if (typeof (parsed as { prompt?: unknown }).prompt === 'string') {
                return normalizeInlineTokenText((parsed as { prompt: string }).prompt);
            }

            if (Array.isArray((parsed as { rows?: unknown }).rows)) {
                const rows = (parsed as { rows: unknown[] }).rows
                    .filter((row): row is string[] => Array.isArray(row))
                    .map((row) => row.join(' | '));
                return normalizeInlineTokenText(rows.join('\n'));
            }
        }
    } catch {
        return normalizeInlineTokenText(group.contentData);
    }

    return normalizeInlineTokenText(group.contentData);
};

export const getAnswerOptions = (
    group: PracticeSessionQuestionGroupDto,
    question?: PracticeSessionQuestionDto | null,
) => {
    const optionLabelType = inferQuestionGroupOptionLabelType(group);
    const effectiveGroupType = getEffectiveMcqGroupType({
        groupType: group.groupType,
        contentData: group.contentData,
        questionCount: group.questions?.length ?? 0,
        hasQuestionContent: (group.questions ?? []).some((item) => !!item.content?.trim()),
    });
    const groupType = (effectiveGroupType || group.groupType || '').trim().toUpperCase();
    const usesOptionTextAsAnswer = groupType === 'TFNG' || groupType === 'YNNG';
    const questionOptions = question?.options ?? [];
    const rawOptions = questionOptions.length > 0 ? questionOptions : getSharedOptions(group);
    const options = sortOptions(rawOptions);

    return options.map((option, index) => ({
        label: usesOptionTextAsAnswer
            ? normalizeText(option.optionText) || getOptionLabel(index, optionLabelType)
            : getOptionLabel(index, optionLabelType),
        text: normalizeText(option.optionText) || null,
    }));
};

export const getEffectiveObjectiveGroupType = (group: PracticeSessionQuestionGroupDto) => (
    getEffectiveMcqGroupType({
        groupType: group.groupType,
        contentData: group.contentData,
        questionCount: group.questions.length,
        hasQuestionContent: group.questions.some((item) => !!item.content?.trim()),
    }) || group.groupType || ''
).trim().toUpperCase();

export const isChooseNGroup = (group: PracticeSessionQuestionGroupDto) => (
    getEffectiveObjectiveGroupType(group) === 'MCQ_CHOOSE_N' && group.questions.length > 1
);

export const resolveAnswerText = (
    answer: string | null | undefined,
    options: Array<{ label: string; text: string | null }>,
) => {
    const trimmed = normalizeText(answer);
    if (!trimmed) {
        return null;
    }

    const optionLookup = new Map<string, { label: string; text: string | null }>();
    options.forEach((option) => {
        optionLookup.set(option.label.trim().toUpperCase(), option);
        if (option.text) {
            optionLookup.set(option.text.trim().toUpperCase(), option);
        }
    });

    return trimmed
        .split('|')
        .map((token) => token.trim())
        .filter(Boolean)
        .map((token) => {
            const matched = optionLookup.get(token.toUpperCase());
            if (!matched) {
                return token;
            }

            return matched.text
                ? `${matched.label}. ${matched.text}`
                : matched.label;
        })
        .join(' | ');
};

export const splitRawAnswerTokens = (value?: string | null) => (
    normalizeText(value)
        .split('|')
        .map((token) => token.trim())
        .filter(Boolean)
);

export const formatAnswerTokensForCopilot = (value?: string | null) => {
    const tokens = splitRawAnswerTokens(value);
    return tokens.length > 1 ? tokens.join(', ') : normalizeText(value);
};

export const resolveGroupOrderedAnswerToken = (
    group: PracticeSessionQuestionGroupDto,
    question: PracticeSessionQuestionDto,
    value?: string | null,
) => {
    const normalizedValue = normalizeText(value);
    const answerTokens = splitRawAnswerTokens(normalizedValue);
    if (answerTokens.length <= 1 || group.questions.length <= 1) {
        return normalizedValue;
    }

    const questionIndex = sortQuestions(group.questions).findIndex((item) => item.id === question.id);
    if (questionIndex < 0 || questionIndex >= answerTokens.length) {
        return normalizedValue;
    }

    return answerTokens[questionIndex];
};

