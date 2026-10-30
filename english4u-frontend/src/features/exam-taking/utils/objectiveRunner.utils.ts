import {
    getEffectiveMcqGroupType,
    inferQuestionGroupOptionLabelType,
    type OptionLabelType,
} from '@/shared/lib/examDisplay';
import {
    getOptionLabel,
    stripOptionLeadingLabel,
} from '@/shared/utils/optionLabel.utils';
import {
    normalizeDisplayText,
    normalizeMarkdownBoldText,
    normalizeBlockMarkdownText,
} from '@/shared/utils/markdown.utils';
import {
    FILL_TYPES,
    MATCHING_TYPES,
    TABLE_TITLE_PLACEHOLDER,
    TEXT_ANSWER_BOX_GROUP_TYPES,
    type ObjectiveReviewAnswerMap,
} from '../constants/objectiveRunner.constants';
import type {
    PracticeSessionAnswerDto,
    PracticeSessionDto,
    PracticeSessionListeningPartDto,
    PracticeSessionQuestionDto,
    PracticeSessionQuestionGroupDto,
} from '../types/session.types';
import { resolveQuestionSpecificCorrectAnswer } from './reviewCopilotContext.utils';

export const getReviewAnswerState = (questionId: string, reviewAnswerMap?: ObjectiveReviewAnswerMap) =>
    reviewAnswerMap?.[questionId];

export const getReviewAnswerBorderColor = (answer?: PracticeSessionAnswerDto) => {
    if (answer?.isCorrect === true) return '#22c55e';
    if (answer?.isCorrect === false) return '#ef4444';
    return '#cbd5e1';
};

export const getReviewAnswerBackground = (answer?: PracticeSessionAnswerDto) => {
    if (answer?.isCorrect === true) return '#f0fdf4';
    if (answer?.isCorrect === false) return '#fef2f2';
    return '#f8fafc';
};

export const normalizeChoiceToken = (value?: string | null) => (value ?? '').trim().toUpperCase();

export { normalizeDisplayText, normalizeMarkdownBoldText, normalizeBlockMarkdownText };

export const formatTemplateText = (value?: string | null) =>
    normalizeBlockMarkdownText(value).replace(/\[Q(\d+)\]/g, '_____ `Q$1`');

export const getSharedOptions = (group: PracticeSessionQuestionGroupDto) => {
    const existing = group.questions.find((question) => question.options.length > 0)?.options;
    if (existing && existing.length > 0) {
        return existing;
    }

    const optionLabelType = inferQuestionGroupOptionLabelType(group);
    const instruction = group.instruction || '';

    // Check instruction for letter range e.g. (A-G), (A-H), (A-F)
    const rangeMatch = instruction.match(/\(?([A-Z])\s*[-–—]\s*([A-Z])\)?/i);
    let count = 0;
    if (rangeMatch) {
        const startCode = rangeMatch[1].toUpperCase().charCodeAt(0);
        const endCode = rangeMatch[2].toUpperCase().charCodeAt(0);
        if (endCode >= startCode && endCode - startCode < 26) {
            count = endCode - startCode + 1;
        }
    }

    if (count === 0) {
        let maxLetterCode = 65;
        let hasLetterAnswer = false;
        for (const q of group.questions) {
            const ans = (q.correctAnswer || '').trim().toUpperCase();
            if (/^[A-Z]$/.test(ans)) {
                hasLetterAnswer = true;
                const code = ans.charCodeAt(0);
                if (code > maxLetterCode) {
                    maxLetterCode = code;
                }
            }
        }
        if (hasLetterAnswer) {
            count = maxLetterCode - 65 + 1;
        }
    }

    const isMatchingType = (group.groupType ?? '').toUpperCase().includes('MATCHING');
    if (count === 0 && isMatchingType) {
        count = 7; // Default paragraphs A to G
    }

    if (count > 0) {
        return Array.from({ length: count }, (_, idx) => ({
            id: `synthetic-${group.id}-${idx}`,
            optionText: getOptionLabel(idx, optionLabelType),
            orderIndex: idx,
            imageUrl: null,
            isCorrect: false,
        }));
    }

    return [];
};

export const getGroupOptionLabelType = (group: PracticeSessionQuestionGroupDto): OptionLabelType =>
    inferQuestionGroupOptionLabelType(group);

export const getChoiceLabel = (optionText: string | null | undefined, index: number, optionLabelType: OptionLabelType) => {
    const label = getOptionLabel(index, optionLabelType);
    const trimmedText = stripOptionLeadingLabel(optionText, index, optionLabelType);
    if (!trimmedText || trimmedText.toUpperCase() === label.toUpperCase()) {
        return label;
    }
    return `${label}. ${trimmedText}`;
};

export const isMatchingVisualsGroup = (group: Pick<PracticeSessionQuestionGroupDto, 'groupType'>) =>
    (group.groupType ?? '').toUpperCase() === 'MATCHING_VISUALS';

export const isClassificationMatchingGroup = (group: Pick<PracticeSessionQuestionGroupDto, 'groupType'>) =>
    (group.groupType ?? '').toUpperCase() === 'MATCHING_CLASSIFICATION';

export const isFlowchartLikeGroup = (group: Pick<PracticeSessionQuestionGroupDto, 'groupType'>) =>
    (group.groupType ?? '').toUpperCase() === 'FLOWCHART_COMPLETION'
    || (group.groupType ?? '').toUpperCase() === 'ORDERING_INFORMATION';

export const getSharedSelectOptions = (group: PracticeSessionQuestionGroupDto) => {
    const rawOptions = getSharedOptions(group);
    const allLetterOptions = rawOptions.length > 0 && rawOptions.every((opt) => /^[A-Z]$/i.test((opt.optionText ?? '').trim()));
    const optionLabelType = allLetterOptions ? 'alpha' : getGroupOptionLabelType(group);
    const visualGroup = isMatchingVisualsGroup(group);

    return rawOptions.map((option, index) => {
        const value = getOptionLabel(index, optionLabelType);
        return {
            label: visualGroup ? value : getChoiceLabel(option.optionText, index, optionLabelType),
            value,
        };
    });
};

export const resolveAnswerBoxText = (group: PracticeSessionQuestionGroupDto, rawAnswer: string) => {
    if (!TEXT_ANSWER_BOX_GROUP_TYPES.has((group.groupType ?? '').toUpperCase())) {
        return rawAnswer;
    }

    const options = getSharedOptions(group);
    if (options.length === 0) {
        return rawAnswer;
    }

    const optionLabelType = getGroupOptionLabelType(group);
    const resolvedTokens = rawAnswer
        .split('|')
        .map((token) => {
            const normalizedToken = normalizeChoiceToken(token);
            if (!normalizedToken) {
                return '';
            }

            const optionIndex = options.findIndex((_, index) => (
                normalizeChoiceToken(getOptionLabel(index, optionLabelType)) === normalizedToken
            ));
            const optionText = optionIndex >= 0 ? options[optionIndex]?.optionText?.trim() : '';
            return optionText || token.trim();
        })
        .filter((token) => token.length > 0);

    return resolvedTokens.length > 0 ? resolvedTokens.join(' | ') : rawAnswer;
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

export const formatAnswerTokenListForReview = (value: string) => value
    .split('|')
    .map((token) => token.trim())
    .filter(Boolean)
    .join(', ');

export const getReviewCorrectAnswerLabel = () => 'Đáp án đúng';

export const formatReviewCorrectAnswer = (
    group: PracticeSessionQuestionGroupDto,
    question: PracticeSessionQuestionDto,
    answer?: PracticeSessionAnswerDto,
) => {
    const correctAnswer = resolveQuestionSpecificCorrectAnswer(group, question, answer).trim();
    if (correctAnswer) {
        const resolved = resolveAnswerBoxText(group, correctAnswer);
        return isChooseNGroup(group) ? formatAnswerTokenListForReview(resolved) : resolved;
    }

    return '';
};

export const parseSharedPromptContent = (contentData?: string | null) => {
    if (!contentData) {
        return { prompt: '', isSharedPromptLayout: false };
    }

    try {
        const parsed = JSON.parse(contentData) as unknown;
        if (typeof parsed === 'string') {
            return { prompt: parsed, isSharedPromptLayout: false };
        }

        if (parsed && typeof parsed === 'object' && (parsed as { layout?: unknown }).layout === 'listening_multi_select') {
            return {
                prompt: typeof (parsed as { prompt?: unknown }).prompt === 'string'
                    ? (parsed as { prompt: string }).prompt
                    : '',
                isSharedPromptLayout: true,
            };
        }
    } catch {
        return { prompt: contentData, isSharedPromptLayout: false };
    }

    return { prompt: contentData, isSharedPromptLayout: false };
};

export const parseFlowchartAssets = (assetsData?: string | null) => {
    if (!assetsData) {
        return { imageUrl: '', answerMode: 'text_input' as 'text_input' | 'shared_option_bank' };
    }

    try {
        const parsed = JSON.parse(assetsData) as unknown;
        if (parsed && typeof parsed === 'object') {
            return {
                imageUrl:
                    typeof (parsed as { imageUrl?: unknown }).imageUrl === 'string'
                        ? (parsed as { imageUrl: string }).imageUrl
                        : typeof (parsed as { url?: unknown }).url === 'string'
                            ? (parsed as { url: string }).url
                            : '',
                answerMode:
                    (parsed as { answerMode?: 'text_input' | 'shared_option_bank' }).answerMode ?? 'text_input',
            };
        }
    } catch {
        return { imageUrl: assetsData, answerMode: 'text_input' as const };
    }

    return { imageUrl: '', answerMode: 'text_input' as const };
};

export const isImageUrl = (value?: string | null) => /^https?:\/\/.+/i.test((value ?? '').trim());

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
            const singleImageCandidates = [
                (parsed as { imageUrl?: unknown }).imageUrl,
                (parsed as { url?: unknown }).url,
                (parsed as { assetUrl?: unknown }).assetUrl,
            ];
            const imageList = Array.isArray((parsed as { images?: unknown }).images)
                ? (parsed as { images: unknown[] }).images
                : [];

            return [
                ...singleImageCandidates,
                ...imageList,
            ]
                .filter((item): item is string => typeof item === 'string')
                .map((item) => item.trim())
                .filter((item) => isImageUrl(item));
        }
    } catch {
        return isImageUrl(assetsData) ? [assetsData.trim()] : [];
    }

    return [];
};

export const getSharedListeningAudioUrl = (parts: PracticeSessionListeningPartDto[] = []) =>
    parts
        .map((part) => (part.audioUrl ?? '').trim())
        .find((audioUrl) => audioUrl.length > 0)
    ?? '';

export const formatAudioTime = (seconds?: number | null) => {
    if (seconds == null || !Number.isFinite(seconds)) {
        return '0:00';
    }

    const totalSeconds = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
};

export const getFlowchartUsesAnswerBank = (group: PracticeSessionQuestionGroupDto) => {
    if (!isFlowchartLikeGroup(group)) {
        return false;
    }

    if ((group.groupType ?? '').toUpperCase() === 'ORDERING_INFORMATION') {
        return true;
    }

    return parseFlowchartAssets(group.assetsData).answerMode === 'shared_option_bank';
};

export const parseTableContent = (contentData?: string | null) => {
    if (!contentData) {
        return { title: '', rows: [] as string[][] };
    }

    try {
        const parsed = JSON.parse(contentData) as unknown;
        const rows = Array.isArray(parsed)
            ? parsed
            : (parsed && typeof parsed === 'object' && Array.isArray((parsed as { rows?: unknown }).rows)
                ? (parsed as { rows: unknown[] }).rows
                : []);
        const title = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            && typeof (parsed as { title?: unknown }).title === 'string'
            ? (parsed as { title: string }).title.trim()
            : '';

        return {
            title: title === TABLE_TITLE_PLACEHOLDER ? '' : title,
            rows: rows.filter((row): row is string[] => Array.isArray(row))
                .map((row) => row.map((cell) => typeof cell === 'string' ? cell : '')),
        };
    } catch {
        return { title: '', rows: [] as string[][] };
    }
};

export const buildInitialAnswers = (session?: PracticeSessionDto | null) => {
    if (!session) {
        return {};
    }

    return session.answers.reduce<Record<string, string>>((accumulator, answer) => {
        if (answer.answerText) {
            accumulator[answer.questionId] = answer.answerText;
        }
        return accumulator;
    }, {});
};

export const getQuestionInputType = (group: PracticeSessionQuestionGroupDto) => {
    const groupType = (group.groupType ?? '').toUpperCase();
    const parsedPrompt = parseSharedPromptContent(group.contentData);
    const usesSharedPrompt = parsedPrompt.isSharedPromptLayout;

    const isMCQ = groupType === 'MCQ_CHOOSE_N' || groupType === 'MCQ_MULTIPLE' || groupType === 'MCQ_SINGLE';

    if (MATCHING_TYPES.has(groupType) || (isFlowchartLikeGroup(group) && getFlowchartUsesAnswerBank(group)) || (usesSharedPrompt && !isMCQ)) {
        return 'shared-select';
    }

    if (FILL_TYPES.has(groupType)) {
        return 'text';
    }

    if (groupType === 'TFNG' || groupType === 'YNNG' || groupType === 'MCQ_SINGLE' || groupType === 'MCQ_MULTIPLE' || groupType === 'MCQ_CHOOSE_N') {
        return 'single-choice';
    }

    return group.questions.some((question) => question.options.length > 0) ? 'single-choice' : 'text';
};

export const hasTemplateQuestionTokens = (value?: string | null) => /\[Q\d+\]/.test(value ?? '');

