export const QUESTION_TYPES = {
    MCQ_SINGLE: 'MCQ_SINGLE',
    MCQ_MULTIPLE: 'MCQ_MULTIPLE',
    TFNG: 'TFNG',
    YNNG: 'YNNG',
    MATCHING_HEADINGS: 'MATCHING_HEADINGS',
    MATCHING_INFO: 'MATCHING_INFO',
    MATCHING_FEATURES: 'MATCHING_FEATURES',
    SENTENCE_COMPLETION: 'SENTENCE_COMPLETION',
    SUMMARY_COMPLETION: 'SUMMARY_COMPLETION',
    TABLE_COMPLETION: 'TABLE_COMPLETION',
    MATCHING_TABLE: 'MATCHING_TABLE',
    FLOWCHART_COMPLETION: 'FLOWCHART_COMPLETION',
    MAP_LABELLING: 'MAP_LABELLING',
    SHORT_ANSWER: 'SHORT_ANSWER',
} as const;

export type QuestionType = typeof QUESTION_TYPES[keyof typeof QUESTION_TYPES];

export const SINGLE_CHOICE_TYPES = new Set<string>([
    QUESTION_TYPES.MCQ_SINGLE,
    QUESTION_TYPES.TFNG,
    QUESTION_TYPES.YNNG,
]);

export const MULTI_CHOICE_TYPES = new Set<string>([
    QUESTION_TYPES.MCQ_MULTIPLE,
]);

export const MATCHING_TYPES = new Set<string>([
    QUESTION_TYPES.MATCHING_HEADINGS,
    QUESTION_TYPES.MATCHING_INFO,
    QUESTION_TYPES.MATCHING_FEATURES,
    QUESTION_TYPES.MATCHING_TABLE,
]);

export const FILL_TYPES = new Set<string>([
    QUESTION_TYPES.SENTENCE_COMPLETION,
    QUESTION_TYPES.TABLE_COMPLETION,
    QUESTION_TYPES.FLOWCHART_COMPLETION,
    QUESTION_TYPES.SHORT_ANSWER,
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
    { label: 'Multiple Choice (Single)', value: QUESTION_TYPES.MCQ_SINGLE },
    { label: 'Multiple Choice (Multiple)', value: QUESTION_TYPES.MCQ_MULTIPLE },
    { label: 'True/False/Not Given', value: QUESTION_TYPES.TFNG },
    { label: 'Yes/No/Not Given', value: QUESTION_TYPES.YNNG },
    { label: 'Matching Headings', value: QUESTION_TYPES.MATCHING_HEADINGS },
    { label: 'Matching Information', value: QUESTION_TYPES.MATCHING_INFO },
    { label: 'Matching Features', value: QUESTION_TYPES.MATCHING_FEATURES },
    { label: 'Sentence Completion', value: QUESTION_TYPES.SENTENCE_COMPLETION },
    { label: 'Summary Completion', value: QUESTION_TYPES.SUMMARY_COMPLETION },
    { label: 'Table Completion', value: QUESTION_TYPES.TABLE_COMPLETION },
    { label: 'Matching Information to Table', value: QUESTION_TYPES.MATCHING_TABLE },
    { label: 'Flowchart Completion', value: QUESTION_TYPES.FLOWCHART_COMPLETION },
    { label: 'Short Answer', value: QUESTION_TYPES.SHORT_ANSWER },
];

export const LISTENING_QUESTION_TYPE_OPTIONS = [
    { label: 'Multiple Choice (Single)', value: QUESTION_TYPES.MCQ_SINGLE },
    { label: 'Multiple Choice (Multiple)', value: QUESTION_TYPES.MCQ_MULTIPLE },
    { label: 'Matching', value: QUESTION_TYPES.MATCHING_FEATURES },
    { label: 'Form/Note Completion', value: QUESTION_TYPES.SENTENCE_COMPLETION },
    { label: 'Summary Completion', value: QUESTION_TYPES.SUMMARY_COMPLETION },
    { label: 'Table Completion', value: QUESTION_TYPES.TABLE_COMPLETION },
    { label: 'Flowchart Completion', value: QUESTION_TYPES.FLOWCHART_COMPLETION },
    { label: 'Label the Map', value: QUESTION_TYPES.MAP_LABELLING },
    { label: 'Short Answer', value: QUESTION_TYPES.SHORT_ANSWER },
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
