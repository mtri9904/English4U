import type { ReactNode } from 'react';
import type {
    PracticeSessionAnswerDto,
    PracticeSessionQuestionDto,
    PracticeSessionQuestionGroupDto,
} from '../types/session.types';

export const MATCHING_TYPES = new Set([
    'MATCHING_HEADINGS',
    'MATCHING_INFO',
    'MATCHING_FEATURES',
    'MATCHING_CLASSIFICATION',
    'MATCHING_VISUALS',
    'MATCHING_TABLE',
    'MAP_LABELLING',
]);

export const TABLE_TYPES = new Set([
    'TABLE_COMPLETION',
    'MATCHING_TABLE',
]);

export const FILL_TYPES = new Set([
    'SENTENCE_COMPLETION',
    'SUMMARY_COMPLETION',
    'TABLE_COMPLETION',
    'FLOWCHART_COMPLETION',
    'SHORT_ANSWER',
    'SHORT_ANSWER_QUESTIONS',
]);

export const TABLE_TITLE_PLACEHOLDER = 'Tiêu đề bảng';

export const INLINE_TEMPLATE_INPUT_TYPES = new Set(['text', 'shared-select']);
export const MAX_MCQ_MULTIPLE_SELECTIONS = 2;

export const TEXT_ANSWER_BOX_GROUP_TYPES = new Set([
    'SUMMARY_COMPLETION',
    'FLOWCHART_COMPLETION',
    'ORDERING_INFORMATION',
]);

export type ObjectiveReviewAnswerMap = Record<string, PracticeSessionAnswerDto | undefined>;

export type RenderQuestionAction = (params: {
    group: PracticeSessionQuestionGroupDto;
    question: PracticeSessionQuestionDto;
    reviewAnswer?: PracticeSessionAnswerDto;
    compact?: boolean;
}) => ReactNode;

