import type {
    CreateListeningPartDto,
    CreateQuestionDto,
    CreateQuestionGroupDto,
    CreateQuestionOptionDto,
    CreateReadingPassageDto,
    CreateSectionDto,
    CreateSpeakingPartDto,
    CreateSpeakingQuestionDto,
    CreateWritingTaskDto,
} from '../../types/exam.types';
import {
    LISTENING_QUESTION_TYPE_OPTIONS,
    MATCHING_TYPES,
    MULTI_CHOICE_TYPES,
    QUESTION_TYPES,
    READING_QUESTION_TYPE_OPTIONS,
    SINGLE_CHOICE_TYPES,
    TFNG_OPTIONS,
    YNNG_OPTIONS,
    type SkillType,
} from '../../constants/questionTypes';

export const SKILL_COLORS: Record<SkillType, string> = {
    Reading: '#10b981',
    Listening: '#6366f1',
    Writing: '#f59e0b',
    Speaking: '#ef4444',
};

export const GROUP_TYPE_OPTIONS: Record<string, { label: string; value: string }[]> = {
    Reading: READING_QUESTION_TYPE_OPTIONS,
    Listening: LISTENING_QUESTION_TYPE_OPTIONS,
};

export const COMPLEX_LAYOUT_GROUP_TYPES = new Set<string>([
    'TABLE_COMPLETION',
    'MATCHING_TABLE',
    'NOTE_COMPLETION',
    'FORM_COMPLETION',
    'SUMMARY_COMPLETION',
    'SENTENCE_COMPLETION',
    'FLOWCHART_COMPLETION',
]);

export const TABLE_LAYOUT_GROUP_TYPES = new Set<string>([
    'TABLE_COMPLETION',
    'MATCHING_TABLE',
]);

export const emptyOption = (idx = 0): CreateQuestionOptionDto => ({
    optionText: '',
    isCorrect: false,
    orderIndex: idx,
});

export const emptyQuestion = (): CreateQuestionDto => ({
    content: '',
    correctAnswer: undefined,
    points: 1,
    options: [],
});

export const emptyGroup = (groupType = 'MCQ_SINGLE'): CreateQuestionGroupDto => ({
    groupType,
    instruction: '',
    questions: [emptyQuestion()],
});

export const emptyPassage = (): CreateReadingPassageDto => ({
    title: '',
    paragraphsData: '',
    questionGroups: [emptyGroup()],
});

export const emptyListeningPart = (): CreateListeningPartDto => ({
    partNumber: 1,
    audioUrl: '',
    contextDescription: '',
    questionGroups: [emptyGroup()],
});

export const emptyWritingTask = (taskNumber = 1): CreateWritingTaskDto => ({
    taskNumber,
    promptText: '',
    minWords: taskNumber === 1 ? 150 : 250,
});

export const emptySpeakingQuestion = (): CreateSpeakingQuestionDto => ({
    content: '',
    cueCardPoints: undefined,
    audioPromptUrl: undefined,
});

export const emptySpeakingPart = (partNumber = 1): CreateSpeakingPartDto => ({
    partNumber,
    description: '',
    questions: [emptySpeakingQuestion()],
});

export const emptySection = (skill: SkillType): CreateSectionDto => {
    const base: CreateSectionDto = { skillType: skill, title: `${skill} Section`, orderIndex: 0 };

    if (skill === 'Reading') {
        base.readingPassages = [emptyPassage()];
    }

    if (skill === 'Listening') {
        base.listeningParts = [emptyListeningPart()];
    }

    if (skill === 'Writing') {
        base.writingTasks = [emptyWritingTask(1), emptyWritingTask(2)];
    }

    if (skill === 'Speaking') {
        base.speakingParts = [emptySpeakingPart(1), emptySpeakingPart(2), emptySpeakingPart(3)];
    }

    return base;
};

export const reorderQuestionNumbers = (groups: CreateQuestionGroupDto[], startQNum: number) => {
    let currentQ = startQNum;

    return groups.map((group) => {
        const isComplex = COMPLEX_LAYOUT_GROUP_TYPES.has(group.groupType ?? '');

        let newGroup: CreateQuestionGroupDto;

        if (isComplex && group.contentData) {
            const regex = /\[Q(\d+)\]/g;
            const matches = [...group.contentData.matchAll(regex)];
            const oldToNew = new Map<number, number>();
            const orderedOldNums: number[] = [];
            const seen = new Set<number>();

            matches.forEach((match) => {
                const old = Number.parseInt(match[1], 10);
                if (!seen.has(old)) {
                    seen.add(old);
                    orderedOldNums.push(old);
                }
            });

            const startVal = currentQ;
            orderedOldNums.forEach((old) => {
                oldToNew.set(old, currentQ++);
            });
            const endVal = currentQ - 1;

            const newContent = group.contentData.replace(/\[Q(\d+)\]/g, (_, p1: string) => {
                const old = Number.parseInt(p1, 10);
                return `[Q${oldToNew.get(old) || p1}]`;
            });

            const newQuestions = orderedOldNums.map((old) => {
                const existing = group.questions.find((question) => question.questionNumber === old);
                const newNum = oldToNew.get(old)!;
                return existing
                    ? { ...existing, questionNumber: newNum }
                    : { ...emptyQuestion(), questionNumber: newNum };
            });

            newGroup = {
                ...group,
                contentData: newContent,
                questions: newQuestions,
                startQuestion: startVal,
                endQuestion: endVal,
            };
        } else {
            const startVal = currentQ;
            const newQuestions = group.questions.map((question) => ({
                ...question,
                questionNumber: currentQ++,
            }));
            const endVal = currentQ - 1;
            newGroup = {
                ...group,
                questions: newQuestions,
                startQuestion: startVal,
                endQuestion: endVal,
            };
        }

        return newGroup;
    });
};

export const getOptionsForType = (groupType?: string): CreateQuestionOptionDto[] => {
    if (!groupType) return [];

    if (groupType === QUESTION_TYPES.TFNG) {
        return TFNG_OPTIONS.map((option) => ({ ...option }));
    }

    if (groupType === QUESTION_TYPES.YNNG) {
        return YNNG_OPTIONS.map((option) => ({ ...option }));
    }

    if (groupType === QUESTION_TYPES.MATCHING_TABLE || MATCHING_TYPES.has(groupType)) {
        return [emptyOption(0), emptyOption(1), emptyOption(2), emptyOption(3)];
    }

    if (groupType === QUESTION_TYPES.MAP_LABELLING) {
        return [
            emptyOption(0),
            emptyOption(1),
            emptyOption(2),
            emptyOption(3),
            emptyOption(4),
            emptyOption(5),
            emptyOption(6),
            emptyOption(7),
        ];
    }

    if (SINGLE_CHOICE_TYPES.has(groupType) || MULTI_CHOICE_TYPES.has(groupType)) {
        return [emptyOption(0), emptyOption(1), emptyOption(2), emptyOption(3)];
    }

    return [];
};

export const cleanUpText = (text: string) => {
    if (!text) return '';

    let processed = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const paragraphMarker = '###PARA###';
    processed = processed.replace(/\n\s*\n/g, paragraphMarker);

    return processed
        .split(paragraphMarker)
        .map((block) => block
            .replace(/\n/g, ' ')
            .replace(/\s+/g, ' ')
            .trim())
        .filter((block) => block.length > 0)
        .join('\n\n');
};
export const cleanUpClipboardText = (pastedText: string) => cleanUpText(pastedText);

export const buildCleanPastedValue = (
    currentValue: string,
    pastedText: string,
    selectionStart?: number | null,
    selectionEnd?: number | null,
) => {
    const cleaned = cleanUpClipboardText(pastedText);
    const safeCurrent = currentValue ?? '';
    const start = typeof selectionStart === 'number' ? selectionStart : safeCurrent.length;
    const end = typeof selectionEnd === 'number' ? selectionEnd : start;

    return safeCurrent.substring(0, start) + cleaned + safeCurrent.substring(end);
};
