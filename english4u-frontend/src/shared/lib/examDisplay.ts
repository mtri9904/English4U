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
    MCQ_MULTIPLE: 'Multiple Choice (Multiple)',
    MCQ_CHOOSE_N: 'Multiple Choice (Choose N)',
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

    if (normalizedType === 'MCQ_MULTIPLE' && hasSharedLayout) {
        return 'MCQ_CHOOSE_N';
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
    groupType?: string | null;
    instruction?: string | null;
    contentData?: string | null;
    questions?: QuestionLike[] | null;
};

export const inferQuestionGroupOptionLabelType = (group: QuestionGroupLike): OptionLabelType => {
    if (group.optionLabelType === 'alpha' || group.optionLabelType === 'roman') {
        return group.optionLabelType;
    }

    const gType = (group.groupType ?? '').toUpperCase();
    if (gType === 'MATCHING_HEADINGS') {
        return 'roman';
    }

    return 'alpha';
};
