import { getOptionLabel } from '@/shared/utils/optionLabel.utils';

export const typeColorMap: Record<string, string> = {
    MCQ_SINGLE: '#7c3aed',
    MCQ_MULTIPLE: '#8b5cf6',
    MCQ_CHOOSE_N: '#8b5cf6',
    TFNG: '#10b981',
    YNNG: '#10b981',
    MATCHING_HEADINGS: '#f59e0b',
    MATCHING_INFO: '#d97706',
    MATCHING_FEATURES: '#b45309',
    MATCHING_CLASSIFICATION: '#b45309',
    MATCHING_VISUALS: '#9a3412',
    SENTENCE_COMPLETION: '#3b82f6',
    SUMMARY_COMPLETION: '#2563eb',
    TABLE_COMPLETION: '#1d4ed8',
    MATCHING_TABLE: '#1e40af',
    FLOWCHART_COMPLETION: '#1e40af',
    ORDERING_INFORMATION: '#0f766e',
    MAP_LABELLING: '#0ea5e9',
    SHORT_ANSWER: '#ec4899',
    SHORT_ANSWER_QUESTIONS: '#db2777',
};

export const MATCHING_TYPES = new Set([
    'MATCHING_HEADINGS',
    'MATCHING_INFO',
    'MATCHING_FEATURES',
    'MATCHING_CLASSIFICATION',
    'MATCHING_VISUALS',
    'MATCHING_TABLE',
    'MAP_LABELLING',
]);

export const TABLE_TYPES = new Set(['TABLE_COMPLETION', 'MATCHING_TABLE']);

export const TABLE_TITLE_PLACEHOLDER = 'Tiêu đề bảng';

export const isFlowchartLikeType = (groupType?: string | null) =>
    groupType === 'FLOWCHART_COMPLETION' || groupType === 'ORDERING_INFORMATION';

export const SKILL_COLORS: Record<string, string> = {
    Reading: '#10b981',
    Listening: '#6366f1',
    Writing: '#f59e0b',
    Speaking: '#ef4444',
};

export const ROMAN_LABEL_TOKENS = Array.from({ length: 20 }, (_, index) => getOptionLabel(index, 'roman'));

