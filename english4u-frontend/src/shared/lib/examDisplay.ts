export type NormalizedSkillType = 'Reading' | 'Listening' | 'Writing' | 'Speaking';
export type OptionLabelType = 'alpha' | 'roman';

export const normalizeSkillType = (skillType?: string | null): NormalizedSkillType | '' => {
    const normalized = (skillType ?? '').trim().toUpperCase();

    if (normalized === 'READING') return 'Reading';
    if (normalized === 'LISTENING') return 'Listening';
    if (normalized === 'WRITING') return 'Writing';
    if (normalized === 'SPEAKING') return 'Speaking';

    return '';
};

const QUESTION_TYPE_LABELS: Record<string, string> = {
    MCQ_SINGLE: 'Multiple Choice (Single)',
    MCQ_MULTIPLE: 'MCQ_MULTIPLE',
    MCQ_CHOOSE_N: 'MCQ_CHOOSE_N',
    TFNG: 'True/False/Not Given',
    YNNG: 'Yes/No/Not Given',
    MATCHING_HEADINGS: 'Matching Headings',
    MATCHING_INFO: 'Matching Information',
    MATCHING_FEATURES: 'Matching Features',
    MATCHING_CLASSIFICATION: 'Matching / Classification',
    MATCHING_VISUALS: 'Matching Visuals',
    SENTENCE_COMPLETION: 'Sentence Completion',
    SUMMARY_COMPLETION: 'Summary Completion',
    TABLE_COMPLETION: 'Table Completion',
    MATCHING_TABLE: 'Matching Information to Table',
    FLOWCHART_COMPLETION: 'Flowchart Completion',
    ORDERING_INFORMATION: 'Ordering Information',
    MAP_LABELLING: 'Label the Diagram',
    SHORT_ANSWER: 'Short Answer',
    SHORT_ANSWER_QUESTIONS: 'Short Answer Questions',
};

const QUESTION_TYPE_LABELS_BY_SKILL: Record<NormalizedSkillType, Record<string, string>> = {
    Reading: {
        MAP_LABELLING: 'Label the Diagram',
    },
    Listening: {
        MATCHING_FEATURES: 'Matching',
        MATCHING_CLASSIFICATION: 'Matching / Classification',
        SENTENCE_COMPLETION: 'Form/Note Completion',
        MAP_LABELLING: 'Label the Map',
    },
    Writing: {},
    Speaking: {},
};

const fallbackQuestionTypeLabel = (groupType: string) =>
    groupType
        .toLowerCase()
        .split('_')
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

export const getQuestionTypeLabel = (groupType?: string | null, skillType?: string | null) => {
    const normalizedType = (groupType ?? '').trim().toUpperCase();
    if (!normalizedType) return '';

    const normalizedSkill = normalizeSkillType(skillType);
    if (normalizedSkill && QUESTION_TYPE_LABELS_BY_SKILL[normalizedSkill][normalizedType]) {
        return QUESTION_TYPE_LABELS_BY_SKILL[normalizedSkill][normalizedType];
    }

    return QUESTION_TYPE_LABELS[normalizedType] ?? fallbackQuestionTypeLabel(normalizedType);
};

export const isSharedMcqAnswerBoxLayout = (contentData?: string | null) => {
    if (!contentData) return false;

    try {
        const parsed = JSON.parse(contentData) as unknown;
        return !!parsed
            && typeof parsed === 'object'
            && (parsed as { layout?: unknown }).layout === 'listening_multi_select';
    } catch {
        return false;
    }
};

export const getEffectiveMcqGroupType = ({
    groupType,
    contentData,
    questionCount = 0,
    hasQuestionContent = false,
}: {
    groupType?: string | null;
    contentData?: string | null;
    questionCount?: number;
    hasQuestionContent?: boolean;
}) => {
    const normalizedType = (groupType ?? '').trim().toUpperCase();
    if (normalizedType !== 'MCQ_MULTIPLE' && normalizedType !== 'MCQ_CHOOSE_N') {
        return normalizedType;
    }

    const hasSharedLayout = isSharedMcqAnswerBoxLayout(contentData);
    const hasMultipleQuestionStems = questionCount > 1 && hasQuestionContent;

    if (normalizedType === 'MCQ_MULTIPLE' && hasSharedLayout) {
        return 'MCQ_CHOOSE_N';
    }

    if (normalizedType === 'MCQ_CHOOSE_N' && hasMultipleQuestionStems && !hasSharedLayout) {
        return 'MCQ_MULTIPLE';
    }

    return normalizedType;
};

type OptionLike = {
    optionText?: string | null;
};

type QuestionLike = {
    correctAnswer?: string | null;
    options?: OptionLike[] | null;
};

type QuestionGroupLike = {
    optionLabelType?: OptionLabelType | null;
    instruction?: string | null;
    contentData?: string | null;
    questions?: QuestionLike[] | null;
};

const ROMAN_LABEL_TOKENS = new Set([
    'i',
    'ii',
    'iii',
    'iv',
    'v',
    'vi',
    'vii',
    'viii',
    'ix',
    'x',
    'xi',
    'xii',
    'xiii',
    'xiv',
    'xv',
    'xvi',
    'xvii',
    'xviii',
    'xix',
    'xx',
]);

const sanitizeLabelToken = (value: string) =>
    value.trim().replace(/^[([{\s]+|[\])}.,;:\s]+$/g, '').toLowerCase();

const isRomanLabelToken = (value?: string | null) => ROMAN_LABEL_TOKENS.has(sanitizeLabelToken(value ?? ''));

const parsePromptText = (contentData?: string | null) => {
    if (!contentData) {
        return '';
    }

    try {
        const parsed = JSON.parse(contentData) as unknown;
        if (typeof parsed === 'string') {
            return parsed;
        }

        if (parsed && typeof parsed === 'object') {
            const prompt = (parsed as { prompt?: unknown }).prompt;
            if (typeof prompt === 'string') {
                return prompt;
            }
        }
    } catch {
        return contentData;
    }

    return contentData;
};

const getSharedOptions = (group: QuestionGroupLike) =>
    group.questions?.find((question) => (question.options?.length ?? 0) > 0)?.options ?? [];

export const inferQuestionGroupOptionLabelType = (group: QuestionGroupLike): OptionLabelType => {
    if (group.optionLabelType === 'alpha' || group.optionLabelType === 'roman') {
        return group.optionLabelType;
    }

    const combinedInstruction = [
        group.instruction ?? '',
        parsePromptText(group.contentData),
        group.contentData ?? '',
    ].join(' ');

    if (/\b(?:appropriate|correct)\s+numbers?\b/i.test(combinedInstruction) ||
        /\bi\s*[-–]\s*(?:v|vi|vii|viii|ix|x|xi|xii|xiii|xiv|xv|xvi|xvii|xviii|xix|xx)\b/i.test(combinedInstruction))
    {
        return 'roman';
    }

    const sharedOptions = getSharedOptions(group);
    if (sharedOptions.some((option) => /^((?:ix|iv|v?i{1,3}|x{1,2}))\s*[).:\-]/i.test(option.optionText ?? ''))) {
        return 'roman';
    }

    const answers = group.questions
        ?.map((question) => question.correctAnswer ?? '')
        .flatMap((answer) => answer.split('|')) ?? [];

    if (answers.some((answer) => isRomanLabelToken(answer))) {
        return 'roman';
    }

    return 'alpha';
};
