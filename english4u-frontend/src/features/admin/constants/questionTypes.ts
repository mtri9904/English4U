import { getQuestionTypeLabel } from '@/shared/lib/examDisplay';

export const QUESTION_TYPES = {
    MCQ_SINGLE: 'MCQ_SINGLE',
    MCQ_MULTIPLE: 'MCQ_MULTIPLE',
    TFNG: 'TFNG',
    YNNG: 'YNNG',
    MATCHING_HEADINGS: 'MATCHING_HEADINGS',
    MATCHING_INFO: 'MATCHING_INFO',
    MATCHING_FEATURES: 'MATCHING_FEATURES',
    MATCHING_CLASSIFICATION: 'MATCHING_CLASSIFICATION',
    MATCHING_VISUALS: 'MATCHING_VISUALS',
    SENTENCE_COMPLETION: 'SENTENCE_COMPLETION',
    SUMMARY_COMPLETION: 'SUMMARY_COMPLETION',
    TABLE_COMPLETION: 'TABLE_COMPLETION',
    MATCHING_TABLE: 'MATCHING_TABLE',
    FLOWCHART_COMPLETION: 'FLOWCHART_COMPLETION',
    ORDERING_INFORMATION: 'ORDERING_INFORMATION',
    MAP_LABELLING: 'MAP_LABELLING',
    SHORT_ANSWER: 'SHORT_ANSWER',
    SHORT_ANSWER_QUESTIONS: 'SHORT_ANSWER_QUESTIONS',
    MCQ_CHOOSE_N: 'MCQ_CHOOSE_N',
} as const;

export type QuestionType = typeof QUESTION_TYPES[keyof typeof QUESTION_TYPES];

export const SINGLE_CHOICE_TYPES = new Set<string>([
    QUESTION_TYPES.MCQ_SINGLE,
    QUESTION_TYPES.TFNG,
    QUESTION_TYPES.YNNG,
]);

export const MULTI_CHOICE_TYPES = new Set<string>([
    QUESTION_TYPES.MCQ_MULTIPLE,
    QUESTION_TYPES.MCQ_CHOOSE_N,
]);

export const MATCHING_TYPES = new Set<string>([
    QUESTION_TYPES.MATCHING_HEADINGS,
    QUESTION_TYPES.MATCHING_INFO,
    QUESTION_TYPES.MATCHING_FEATURES,
    QUESTION_TYPES.MATCHING_CLASSIFICATION,
    QUESTION_TYPES.MATCHING_VISUALS,
    QUESTION_TYPES.MATCHING_TABLE,
]);

export const FILL_TYPES = new Set<string>([
    QUESTION_TYPES.SENTENCE_COMPLETION,
    QUESTION_TYPES.TABLE_COMPLETION,
    QUESTION_TYPES.FLOWCHART_COMPLETION,
    QUESTION_TYPES.SHORT_ANSWER,
    QUESTION_TYPES.SHORT_ANSWER_QUESTIONS,
]);

export const SUMMARY_TYPES = new Set<string>([
    QUESTION_TYPES.SUMMARY_COMPLETION,
]);

export const HAS_OPTIONS_TYPES = new Set<string>([
    ...SINGLE_CHOICE_TYPES,
    ...MULTI_CHOICE_TYPES,
    ...MATCHING_TYPES,
]);

export const TFNG_OPTIONS = [
    { optionText: 'TRUE', isCorrect: false, orderIndex: 0 },
    { optionText: 'FALSE', isCorrect: false, orderIndex: 1 },
    { optionText: 'NOT GIVEN', isCorrect: false, orderIndex: 2 },
];

export const YNNG_OPTIONS = [
    { optionText: 'YES', isCorrect: false, orderIndex: 0 },
    { optionText: 'NO', isCorrect: false, orderIndex: 1 },
    { optionText: 'NOT GIVEN', isCorrect: false, orderIndex: 2 },
];

export const getBehaviorGroup = (type: string): number => {
    if (SINGLE_CHOICE_TYPES.has(type)) return 1;
    if (MULTI_CHOICE_TYPES.has(type)) return 2;
    if (MATCHING_TYPES.has(type)) return 3;
    if (FILL_TYPES.has(type)) return 4;
    if (SUMMARY_TYPES.has(type)) return 5;
    return 0;
};

export const READING_QUESTION_TYPE_OPTIONS = [
    { label: getQuestionTypeLabel(QUESTION_TYPES.MCQ_SINGLE, 'Reading'), value: QUESTION_TYPES.MCQ_SINGLE },
    { label: `${getQuestionTypeLabel(QUESTION_TYPES.MCQ_MULTIPLE, 'Reading')} - nhiều câu con, mỗi câu có thể nhiều đáp án`, value: QUESTION_TYPES.MCQ_MULTIPLE },
    { label: `${getQuestionTypeLabel(QUESTION_TYPES.MCQ_CHOOSE_N, 'Reading')} - 1 block option chung, N ô đáp án`, value: QUESTION_TYPES.MCQ_CHOOSE_N },
    { label: getQuestionTypeLabel(QUESTION_TYPES.TFNG, 'Reading'), value: QUESTION_TYPES.TFNG },
    { label: getQuestionTypeLabel(QUESTION_TYPES.YNNG, 'Reading'), value: QUESTION_TYPES.YNNG },
    { label: getQuestionTypeLabel(QUESTION_TYPES.MATCHING_HEADINGS, 'Reading'), value: QUESTION_TYPES.MATCHING_HEADINGS },
    { label: getQuestionTypeLabel(QUESTION_TYPES.MATCHING_INFO, 'Reading'), value: QUESTION_TYPES.MATCHING_INFO },
    { label: getQuestionTypeLabel(QUESTION_TYPES.MATCHING_FEATURES, 'Reading'), value: QUESTION_TYPES.MATCHING_FEATURES },
    { label: `${getQuestionTypeLabel(QUESTION_TYPES.MATCHING_VISUALS, 'Reading')} (A-D)`, value: QUESTION_TYPES.MATCHING_VISUALS },
    { label: getQuestionTypeLabel(QUESTION_TYPES.SENTENCE_COMPLETION, 'Reading'), value: QUESTION_TYPES.SENTENCE_COMPLETION },
    { label: getQuestionTypeLabel(QUESTION_TYPES.SUMMARY_COMPLETION, 'Reading'), value: QUESTION_TYPES.SUMMARY_COMPLETION },
    { label: getQuestionTypeLabel(QUESTION_TYPES.TABLE_COMPLETION, 'Reading'), value: QUESTION_TYPES.TABLE_COMPLETION },
    { label: getQuestionTypeLabel(QUESTION_TYPES.MATCHING_TABLE, 'Reading'), value: QUESTION_TYPES.MATCHING_TABLE },
    { label: getQuestionTypeLabel(QUESTION_TYPES.FLOWCHART_COMPLETION, 'Reading'), value: QUESTION_TYPES.FLOWCHART_COMPLETION },
    { label: getQuestionTypeLabel(QUESTION_TYPES.ORDERING_INFORMATION, 'Reading'), value: QUESTION_TYPES.ORDERING_INFORMATION },
    { label: getQuestionTypeLabel(QUESTION_TYPES.MAP_LABELLING, 'Reading'), value: QUESTION_TYPES.MAP_LABELLING },
    { label: getQuestionTypeLabel(QUESTION_TYPES.SHORT_ANSWER, 'Reading'), value: QUESTION_TYPES.SHORT_ANSWER },
    { label: getQuestionTypeLabel(QUESTION_TYPES.SHORT_ANSWER_QUESTIONS, 'Reading'), value: QUESTION_TYPES.SHORT_ANSWER_QUESTIONS },
];

export const LISTENING_QUESTION_TYPE_OPTIONS = [
    { label: getQuestionTypeLabel(QUESTION_TYPES.MCQ_SINGLE, 'Listening'), value: QUESTION_TYPES.MCQ_SINGLE },
    { label: `${getQuestionTypeLabel(QUESTION_TYPES.MCQ_MULTIPLE, 'Listening')} - nhiều câu con, mỗi câu có thể nhiều đáp án`, value: QUESTION_TYPES.MCQ_MULTIPLE },
    { label: `${getQuestionTypeLabel(QUESTION_TYPES.MCQ_CHOOSE_N, 'Listening')} - 1 block option chung, N ô đáp án`, value: QUESTION_TYPES.MCQ_CHOOSE_N },
    { label: getQuestionTypeLabel(QUESTION_TYPES.MATCHING_FEATURES, 'Listening'), value: QUESTION_TYPES.MATCHING_FEATURES },
    { label: `${getQuestionTypeLabel(QUESTION_TYPES.MATCHING_CLASSIFICATION, 'Listening')} - phân loại người/nhóm theo cột A, B`, value: QUESTION_TYPES.MATCHING_CLASSIFICATION },
    { label: getQuestionTypeLabel(QUESTION_TYPES.SENTENCE_COMPLETION, 'Listening'), value: QUESTION_TYPES.SENTENCE_COMPLETION },
    { label: getQuestionTypeLabel(QUESTION_TYPES.SUMMARY_COMPLETION, 'Listening'), value: QUESTION_TYPES.SUMMARY_COMPLETION },
    { label: getQuestionTypeLabel(QUESTION_TYPES.TABLE_COMPLETION, 'Listening'), value: QUESTION_TYPES.TABLE_COMPLETION },
    { label: getQuestionTypeLabel(QUESTION_TYPES.FLOWCHART_COMPLETION, 'Listening'), value: QUESTION_TYPES.FLOWCHART_COMPLETION },
    { label: getQuestionTypeLabel(QUESTION_TYPES.MAP_LABELLING, 'Listening'), value: QUESTION_TYPES.MAP_LABELLING },
    { label: getQuestionTypeLabel(QUESTION_TYPES.SHORT_ANSWER, 'Listening'), value: QUESTION_TYPES.SHORT_ANSWER },
    { label: getQuestionTypeLabel(QUESTION_TYPES.SHORT_ANSWER_QUESTIONS, 'Listening'), value: QUESTION_TYPES.SHORT_ANSWER_QUESTIONS },
];

export const WRITING_QUESTION_TYPE_OPTIONS = [
    { label: 'Task 1 (Graph/Chart)', value: 'WRITING_TASK_1' },
    { label: 'Task 2 (Essay)', value: 'WRITING_TASK_2' },
];

export const SPEAKING_QUESTION_TYPE_OPTIONS = [
    { label: 'Part 1 (Introduction)', value: 'SPEAKING_PART_1' },
    { label: 'Part 2 (Cue Card)', value: 'SPEAKING_PART_2' },
    { label: 'Part 3 (Discussion)', value: 'SPEAKING_PART_3' },
];

export type SkillType = 'Reading' | 'Listening' | 'Writing' | 'Speaking';

export const SKILL_QUESTION_TYPES: Record<SkillType, { label: string; value: string }[]> = {
    Reading: READING_QUESTION_TYPE_OPTIONS,
    Listening: LISTENING_QUESTION_TYPE_OPTIONS,
    Writing: WRITING_QUESTION_TYPE_OPTIONS,
    Speaking: SPEAKING_QUESTION_TYPE_OPTIONS,
};
