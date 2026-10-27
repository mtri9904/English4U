import type {
    CreateListeningPartDto,
    CreateExamDto,
    CreateQuestionDto,
    CreateQuestionGroupDto,
    CreateQuestionOptionDto,
    CreateReadingPassageDto,
    CreateSectionDto,
    CreateSpeakingPartDto,
    CreateSpeakingQuestionDto,
    CreateWritingTaskDto,
} from '@/features/exams/types/exam.types';
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
} from '@/features/exams/components/questionTypes';
import { cleanUpText, buildCleanPastedValue } from '@/shared/utils/input';

export { cleanUpText, buildCleanPastedValue };

// Re-export listening transcript alignment utils for backward compatibility
export * from './examListeningTranscriptAlignment.utils';

export const SKILL_COLORS: Record<SkillType, string> = {
    Reading: '#10b981',
    Listening: '#6366f1',
    Writing: '#f59e0b',
    Speaking: '#ef4444',
};

const normalizeSkillName = (skillType?: string) => (skillType ?? '').trim().toLowerCase();

export const getDefaultDurationForSkill = (skillType?: string) => {
    const normalizedSkill = normalizeSkillName(skillType);

    if (normalizedSkill === 'listening') return 30;
    if (normalizedSkill === 'speaking') return 15;

    return 60;
};

export const GROUP_TYPE_OPTIONS: Record<string, { label: string; value: string }[]> = {
    Reading: READING_QUESTION_TYPE_OPTIONS,
    Listening: LISTENING_QUESTION_TYPE_OPTIONS,
};

export const EXAM_LIMITS = {
    Reading: { passages: 3, questions: 40 },
    Listening: { parts: 4, questions: 40 },
    Writing: { tasks: 2 },
    Speaking: { minParts: 2, parts: 3 },
} as const;

export const countQuestionsInGroups = (groups: CreateQuestionGroupDto[] = []) =>
    groups.reduce((total, group) => total + (group.questions?.length ?? 0), 0);

export const countSectionQuestions = (section: CreateSectionDto, skillType = section.skillType) => {
    const normalizedSkill = normalizeSkillName(skillType);

    if (normalizedSkill === 'reading') {
        return (section.readingPassages ?? []).reduce(
            (total, passage) => total + countQuestionsInGroups(passage.questionGroups),
            0,
        );
    }

    if (normalizedSkill === 'listening') {
        return (section.listeningParts ?? []).reduce(
            (total, part) => total + countQuestionsInGroups(part.questionGroups),
            0,
        );
    }

    return 0;
};

export const getMaxQuestionNumber = (groups: CreateQuestionGroupDto[] = []) => {
    const numbers = groups.flatMap((group) =>
        group.questions
            .map((question) => question.questionNumber)
            .filter((questionNumber): questionNumber is number => typeof questionNumber === 'number'),
    );

    return numbers.length > 0 ? Math.max(...numbers) : 0;
};

export const validateExamStructureLimits = (exam: CreateExamDto) => {
    const errors: string[] = [];

    exam.sections.forEach((section, sectionIndex) => {
        const sectionLabel = `Section ${sectionIndex + 1}`;
        const normalizedSkill = normalizeSkillName(section.skillType);

        if (normalizedSkill === 'reading') {
            const passages = section.readingPassages ?? [];
            const questionCount = countSectionQuestions(section, 'Reading');
            const maxQuestionNumber = Math.max(...passages.map((passage) => getMaxQuestionNumber(passage.questionGroups)), 0);

            if (passages.length > EXAM_LIMITS.Reading.passages) {
                errors.push(`${sectionLabel} Reading chỉ được tối đa ${EXAM_LIMITS.Reading.passages} passages.`);
            }

            if (questionCount !== EXAM_LIMITS.Reading.questions) {
                errors.push(`${sectionLabel} Reading phải có đúng ${EXAM_LIMITS.Reading.questions} câu (hiện có ${questionCount}).`);
            }

            if (maxQuestionNumber > EXAM_LIMITS.Reading.questions) {
                errors.push(`${sectionLabel} Reading không được đánh số quá câu ${EXAM_LIMITS.Reading.questions}.`);
            }
        }

        if (normalizedSkill === 'listening') {
            const parts = section.listeningParts ?? [];
            const questionCount = countSectionQuestions(section, 'Listening');
            const maxQuestionNumber = Math.max(...parts.map((part) => getMaxQuestionNumber(part.questionGroups)), 0);

            if (parts.length > EXAM_LIMITS.Listening.parts) {
                errors.push(`${sectionLabel} Listening chỉ được tối đa ${EXAM_LIMITS.Listening.parts} parts.`);
            }

            if (questionCount !== EXAM_LIMITS.Listening.questions) {
                errors.push(`${sectionLabel} Listening phải có đúng ${EXAM_LIMITS.Listening.questions} câu (hiện có ${questionCount}).`);
            }

            if (maxQuestionNumber > EXAM_LIMITS.Listening.questions) {
                errors.push(`${sectionLabel} Listening không được đánh số quá câu ${EXAM_LIMITS.Listening.questions}.`);
            }
        }

        if (normalizedSkill === 'writing' && (section.writingTasks?.length ?? 0) !== EXAM_LIMITS.Writing.tasks) {
            errors.push(`${sectionLabel} Writing phải có đúng ${EXAM_LIMITS.Writing.tasks} parts/tasks.`);
        }

        if (normalizedSkill === 'speaking') {
            const partCount = section.speakingParts?.length ?? 0;
            if (partCount < EXAM_LIMITS.Speaking.minParts || partCount > EXAM_LIMITS.Speaking.parts) {
                errors.push(`${sectionLabel} Speaking phải có từ ${EXAM_LIMITS.Speaking.minParts} đến ${EXAM_LIMITS.Speaking.parts} parts.`);
            }
        }
    });

    return errors;
};

export const countObjectiveQuestions = (sections: CreateSectionDto[] = []) => (
    sections.reduce((total, section) => total + countSectionQuestions(section), 0)
);

export const normalizeObjectiveQuestionPointsForSubmit = (sections: CreateSectionDto[] = []): CreateSectionDto[] => (
    sections.map((section) => {
        const normalizedSkill = normalizeSkillName(section.skillType);

        if (normalizedSkill === 'reading') {
            return {
                ...section,
                readingPassages: (section.readingPassages ?? []).map((passage) => ({
                    ...passage,
                    questionGroups: passage.questionGroups.map((group) => ({
                        ...group,
                        questions: group.questions.map((question) => ({ ...question, points: 1 })),
                    })),
                })),
            };
        }

        if (normalizedSkill === 'listening') {
            return {
                ...section,
                listeningParts: (section.listeningParts ?? []).map((part) => ({
                    ...part,
                    questionGroups: part.questionGroups.map((group) => ({
                        ...group,
                        questions: group.questions.map((question) => ({ ...question, points: 1 })),
                    })),
                })),
            };
        }

        return section;
    })
);

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
    imageUrl: '',
    isCorrect: false,
    orderIndex: idx,
});

export const getDefaultMcqOptionCount = (skillType?: string) => (
    normalizeSkillName(skillType) === 'listening' ? 3 : 4
);

const buildDefaultOptionsForType = (groupType?: string, skillType?: string): CreateQuestionOptionDto[] => {
    if (!groupType) return [];

    if (groupType === QUESTION_TYPES.TFNG) {
        return TFNG_OPTIONS.map((option) => ({ ...option }));
    }

    if (groupType === QUESTION_TYPES.YNNG) {
        return YNNG_OPTIONS.map((option) => ({ ...option }));
    }

    if (groupType === QUESTION_TYPES.MATCHING_CLASSIFICATION) {
        return [
            { ...emptyOption(0), optionText: 'in favour' },
            { ...emptyOption(1), optionText: 'against' },
        ];
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
        return Array.from({ length: getDefaultMcqOptionCount(skillType) }, (_, index) => emptyOption(index));
    }

    return [];
};

export const emptyQuestion = (): CreateQuestionDto => ({
    content: '',
    correctAnswer: undefined,
    points: 1,
    options: [],
});

export const emptyGroup = (groupType = 'MCQ_SINGLE', skillType?: SkillType): CreateQuestionGroupDto => ({
    groupType,
    instruction: '',
    questions: [{ ...emptyQuestion(), options: buildDefaultOptionsForType(groupType, skillType) }],
});

export const emptyPassage = (): CreateReadingPassageDto => ({
    title: '',
    paragraphsData: '',
    questionGroups: [emptyGroup('MCQ_SINGLE', 'Reading')],
});

export const emptyListeningPart = (): CreateListeningPartDto => ({
    partNumber: 1,
    audioUrl: '',
    contextDescription: '',
    transcriptData: '',
    questionGroups: [emptyGroup('MCQ_SINGLE', 'Listening')],
});

export const getSharedListeningAudioUrl = (parts: CreateListeningPartDto[] = []) =>
    parts
        .map((part) => (part.audioUrl ?? '').trim())
        .find((audioUrl) => audioUrl.length > 0)
    ?? '';

export const applySharedListeningAudioUrl = (
    parts: CreateListeningPartDto[] = [],
    audioUrl: string | null | undefined,
) => {
    const normalizedAudioUrl = (audioUrl ?? '').trim();
    return parts.map((part, index) => ({
        ...part,
        partNumber: part.partNumber ?? index + 1,
        audioUrl: normalizedAudioUrl,
    }));
};

export const normalizeListeningPartsToSharedAudio = (parts: CreateListeningPartDto[] = []) => {
    const sharedAudioUrl = getSharedListeningAudioUrl(parts);
    return applySharedListeningAudioUrl(parts, sharedAudioUrl);
};

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
    description: undefined,
    questions: [emptySpeakingQuestion()],
});

export const sanitizeSpeakingPartsForSubmit = (speakingParts: CreateSpeakingPartDto[] = []): CreateSpeakingPartDto[] => (
    speakingParts.map((part) => ({
        ...part,
        description: undefined,
        questions: (part.questions ?? []).map((question, questionIdx) => ({
            ...question,
            audioPromptUrl: undefined,
            cueCardPoints:
                part.partNumber === 2 && questionIdx === 0
                    ? question.cueCardPoints?.trim() || undefined
                    : undefined,
        })),
    }))
);

export const sanitizeSpeakingSectionsForSubmit = (sections: CreateSectionDto[] = []): CreateSectionDto[] => (
    sections.map((section) => (
        section.skillType === 'Speaking'
            ? { ...section, speakingParts: sanitizeSpeakingPartsForSubmit(section.speakingParts ?? []) }
            : section
    ))
);

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
            const usedNumbers = new Set<number>();
            let nextAvailable = currentQ;

            const reserveNextAvailable = () => {
                while (usedNumbers.has(nextAvailable)) {
                    nextAvailable += 1;
                }

                const reserved = nextAvailable;
                usedNumbers.add(reserved);
                nextAvailable += 1;
                return reserved;
            };

            orderedOldNums.forEach((old) => {
                if (old >= startQNum && !usedNumbers.has(old)) {
                    oldToNew.set(old, old);
                    usedNumbers.add(old);
                    nextAvailable = Math.max(nextAvailable, old + 1);
                    return;
                }

                oldToNew.set(old, reserveNextAvailable());
            });

            const endVal = usedNumbers.size > 0 ? Math.max(...usedNumbers) : currentQ - 1;
            currentQ = endVal + 1;

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
            const newQuestions = group.questions.map((question) => {
                const nextQuestionNumber = currentQ++;
                return {
                    ...question,
                    questionNumber: nextQuestionNumber,
                    content: group.groupType === QUESTION_TYPES.SHORT_ANSWER && question.content
                        ? question.content.replace(/\[Q\d+\]/g, `[Q${nextQuestionNumber}]`)
                        : question.content,
                };
            });
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

export const getOptionsForType = (groupType?: string, skillType?: string): CreateQuestionOptionDto[] => (
    buildDefaultOptionsForType(groupType, skillType)
);

export const cleanUpClipboardText = (pastedText: string) => cleanUpText(pastedText);

export const applyBoldToTextarea = (
    el: HTMLTextAreaElement,
    currentValue: string,
    onApply: (newVal: string) => void
) => {
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = currentValue.substring(start, end);

    let newVal: string;
    let newCursorPos: number;

    if (selected) {
        newVal = currentValue.substring(0, start) + `**${selected}**` + currentValue.substring(end);
        newCursorPos = start + selected.length + 4;
    } else {
        newVal = currentValue.substring(0, start) + `****` + currentValue.substring(end);
        newCursorPos = start + 2;
    }

    onApply(newVal);

    setTimeout(() => {
        el.focus();
        el.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
};

export const buildBlankOptions = (count: number, existingOptions: CreateQuestionDto['options'] = []) =>
    Array.from({ length: count }, (_, index) => ({
        ...(existingOptions[index] ?? emptyOption(index)),
        orderIndex: index,
    }));

export const FIXED_OPTION_MATCHING_TYPES = new Set<string>([
    QUESTION_TYPES.MATCHING_CLASSIFICATION,
]);

export const closeActiveSelectDropdown = () => {
    requestAnimationFrame(() => {
        const active = document.activeElement;
        if (active instanceof HTMLElement) {
            active.blur();
        }
    });
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

export const buildMultiSelectContentData = (prompt = '') => JSON.stringify({
    layout: 'listening_multi_select',
    prompt,
});

export const parseGroupAssetsData = (assetsData?: string | null) => {
    if (!assetsData) return {} as Record<string, unknown>;

    try {
        const parsed = JSON.parse(assetsData) as unknown;
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : {};
    } catch {
        return {};
    }
};

export const getListeningMcqOptionInputMode = (assetsData: string | null | undefined, questionKey: string): 'text' | 'image' => {
    const parsed = parseGroupAssetsData(assetsData);
    const rawMap = parsed.optionInputModeByQuestion;
    if (rawMap && typeof rawMap === 'object' && !Array.isArray(rawMap)) {
        return (rawMap as Record<string, unknown>)[questionKey] === 'image' ? 'image' : 'text';
    }

    return 'text';
};

export const setListeningMcqOptionInputMode = (
    assetsData: string | null | undefined,
    questionKey: string,
    mode: 'text' | 'image',
) => {
    const parsed = parseGroupAssetsData(assetsData);
    const nextMap = parsed.optionInputModeByQuestion && typeof parsed.optionInputModeByQuestion === 'object' && !Array.isArray(parsed.optionInputModeByQuestion)
        ? { ...(parsed.optionInputModeByQuestion as Record<string, unknown>) }
        : {};

    if (mode === 'image') nextMap[questionKey] = 'image';
    else delete nextMap[questionKey];

    const nextPayload: Record<string, unknown> = { ...parsed };
    if (Object.keys(nextMap).length > 0) nextPayload.optionInputModeByQuestion = nextMap;
    else delete nextPayload.optionInputModeByQuestion;

    return Object.keys(nextPayload).length > 0 ? JSON.stringify(nextPayload) : undefined;
};
