import type {
    AlignListeningTranscriptResultDto,
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
    ListeningTranscriptAlignmentQuestionDto,
    ListeningTranscriptQuestionAlignmentDto,
    ListeningTranscriptSegmentDto,
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
import { hydrateListeningTranscriptAlignments } from '@/shared/lib/listeningTranscript';
import { getOptionLabel } from '@/shared/utils/optionLabel.utils';

export const SKILL_COLORS: Record<SkillType, string> = {
    Reading: '#10b981',
    Listening: '#6366f1',
    Writing: '#f59e0b',
    Speaking: '#ef4444',
};

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

const normalizeSkillName = (skillType?: string) => (skillType ?? '').trim().toLowerCase();

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

const normalizeTranscriptMatchText = (value?: string | null) => (
    (value ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9.%/$&+' -]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
);

const splitAnswerCandidates = (value?: string | null) => (
    (value ?? '')
        .split('|')
        .map((item) => normalizeTranscriptMatchText(item))
        .filter((item) => item.length >= 2)
);

const transcriptStopwords = new Set([
    'the', 'and', 'that', 'this', 'with', 'from', 'into', 'your', 'their', 'there', 'about', 'would', 'could',
    'should', 'have', 'has', 'had', 'were', 'was', 'been', 'being', 'while', 'where', 'when', 'which', 'what',
    'then', 'than', 'them', 'they', 'those', 'these', 'just', 'also', 'only', 'more', 'most', 'very',
    'much', 'many', 'some', 'such', 'over', 'under', 'after', 'before', 'because', 'through', 'during', 'between',
    'each', 'other', 'another', 'into', 'onto', 'upon', 'across', 'around', 'within', 'without', 'against', 'among',
    'student', 'students', 'answer', 'question', 'questions', 'listening', 'part', 'section',
]);

const transcriptIntroPhrases = [
    'i ll tell you something about',
    'let s look at',
    'a word about',
    'before you hear',
    'now listen',
    'listen carefully',
    'you will hear',
    'first you have some time',
    'you have some time to look at',
    'now turn to section',
    'that is the end of section',
    'you now have half a minute',
    'hi great to see you',
    'i m jodi',
    'i ll be looking after both of you',
];

const buildTranscriptTokenVariants = (token: string) => {
    const normalized = normalizeTranscriptMatchText(token);
    if (!normalized || normalized.includes(' ')) {
        return new Set<string>();
    }

    const variants = new Set<string>([normalized]);

    if (normalized.endsWith('ies') && normalized.length > 4) {
        variants.add(`${normalized.slice(0, -3)}y`);
    }

    if (normalized.endsWith('ing') && normalized.length > 5) {
        const stem = normalized.slice(0, -3);
        variants.add(stem);
        variants.add(`${stem}e`);
    }

    if (normalized.endsWith('ed') && normalized.length > 4) {
        const stem = normalized.slice(0, -2);
        variants.add(stem);
        variants.add(`${stem}e`);
    }

    if (normalized.endsWith('es') && normalized.length > 4) {
        variants.add(normalized.slice(0, -2));
    }

    if (normalized.endsWith('s') && normalized.length > 3) {
        variants.add(normalized.slice(0, -1));
    }

    return new Set(Array.from(variants).filter((variant) => variant.length >= 2));
};

const extractTranscriptTokens = (value?: string | null) => {
    const normalized = normalizeTranscriptMatchText(value);
    if (!normalized) {
        return new Set<string>();
    }

    const tokens = new Set<string>();
    normalized.split(' ').forEach((token) => {
        if (!token) {
            return;
        }

        buildTranscriptTokenVariants(token).forEach((variant) => {
            tokens.add(variant);
        });
    });

    return tokens;
};

const looksLikeTranscriptIntroSegment = (rawText: string) => {
    const normalized = normalizeTranscriptMatchText(rawText);
    return transcriptIntroPhrases.some((phrase) => normalized.includes(phrase));
};

const getQuestionAnswerCandidates = (question: CreateQuestionDto) => {
    const directAnswers = splitAnswerCandidates(question.correctAnswer);
    const correctOptionTexts = (question.options ?? [])
        .filter((option) => option.isCorrect)
        .map((option) => normalizeTranscriptMatchText(option.optionText))
        .filter((item) => item.length >= 2);

    return Array.from(new Set([...directAnswers, ...correctOptionTexts]));
};

const splitAlignmentAnswerTokens = (value?: string | null) => (
    (value ?? '')
        .split('|')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
);

const resolveQuestionCorrectOptionTexts = (
    group: CreateQuestionGroupDto,
    question: CreateQuestionDto,
) => {
    const directMarkedTexts = (question.options ?? [])
        .filter((option) => option.isCorrect && option.optionText?.trim())
        .map((option) => option.optionText.trim());

    const labelType = group.optionLabelType ?? 'alpha';
    const answerTokens = splitAlignmentAnswerTokens(question.correctAnswer);
    const resolvedTexts = answerTokens.flatMap((token) => {
        const matchingIndex = (question.options ?? []).findIndex((_, index) => (
            getOptionLabel(index, labelType).toLowerCase() === token.toLowerCase()
        ));

        if (matchingIndex < 0) {
            return [];
        }

        const optionText = question.options?.[matchingIndex]?.optionText?.trim();
        return optionText ? [optionText] : [];
    });

    return Array.from(new Set([...directMarkedTexts, ...resolvedTexts]));
};

const getQuestionEvidenceTokens = (question: CreateQuestionDto) => {
    const tokens = new Set<string>();

    getQuestionAnswerCandidates(question).forEach((candidate) => {
        extractTranscriptTokens(candidate).forEach((token) => {
            tokens.add(token);
        });
    });

    return Array.from(tokens).filter((token) => token.length >= 3 && !transcriptStopwords.has(token));
};

const getQuestionKeywordTokens = (question: CreateQuestionDto) => {
    const normalizedContent = normalizeTranscriptMatchText(question.content);
    if (!normalizedContent) {
        return [];
    }

    return normalizedContent
        .split(' ')
        .filter((token) => token.length >= 3 && !transcriptStopwords.has(token));
};

const collectListeningQuestions = (parts: CreateListeningPartDto[] = []) => (
    parts
        .flatMap((part) => part.questionGroups ?? [])
        .flatMap((group) => group.questions ?? [])
        .filter((question) => question.questionNumber != null)
        .sort((left, right) => (
            (left.questionNumber ?? Number.MAX_SAFE_INTEGER) - (right.questionNumber ?? Number.MAX_SAFE_INTEGER)
        ))
);

const extractQuestionSpecificGroupContentContext = (
    contentData?: string | null,
    questionNumber?: number | null,
) => {
    if (!contentData?.trim() || questionNumber == null) {
        return '';
    }

    const token = `[Q${questionNumber}]`;
    const normalizedLines = contentData
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    const lineIndex = normalizedLines.findIndex((line) => line.includes(token));
    if (lineIndex >= 0) {
        return normalizedLines
            .slice(Math.max(0, lineIndex - 1), Math.min(normalizedLines.length, lineIndex + 2))
            .join('\n');
    }

    const tokenIndex = contentData.indexOf(token);
    if (tokenIndex >= 0) {
        const snippetStart = Math.max(0, tokenIndex - 140);
        const snippetEnd = Math.min(contentData.length, tokenIndex + token.length + 140);
        return contentData.slice(snippetStart, snippetEnd).trim();
    }

    return '';
};

const extractAlignmentContextText = (part: CreateListeningPartDto, group: CreateQuestionGroupDto, question: CreateQuestionDto) => (
    [
        part.contextDescription ?? '',
        group.instruction ?? '',
        extractQuestionSpecificGroupContentContext(group.contentData, question.questionNumber),
        question.content ?? '',
    ]
        .map((item) => item.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join('\n')
);

export const buildListeningTranscriptAlignmentQuestions = (
    parts: CreateListeningPartDto[] = [],
): ListeningTranscriptAlignmentQuestionDto[] => (
    parts.flatMap((part) => (
        (part.questionGroups ?? []).flatMap((group) => (
            (group.questions ?? [])
                .filter((question) => question.questionNumber != null)
                .map((question) => ({
                    questionNumber: question.questionNumber!,
                    questionText: question.content ?? '',
                    correctAnswer: question.correctAnswer ?? '',
                    correctOptionTexts: resolveQuestionCorrectOptionTexts(group, question),
                    contextText: extractAlignmentContextText(part, group, question),
                    groupType: group.groupType ?? null,
                }))
        ))
    )).sort((left, right) => left.questionNumber - right.questionNumber)
);

const buildListeningTranscriptGroupTypeLookup = (parts: CreateListeningPartDto[] = []) => {
    const groupTypeByQuestionNumber = new Map<number, string | null>();

    parts.forEach((part) => {
        (part.questionGroups ?? []).forEach((group) => {
            (group.questions ?? []).forEach((question) => {
                if (question.questionNumber == null) {
                    return;
                }

                groupTypeByQuestionNumber.set(question.questionNumber, group.groupType ?? null);
            });
        });
    });

    return groupTypeByQuestionNumber;
};

export const hydrateListeningTranscriptQuestionAlignments = (
    segments: ListeningTranscriptSegmentDto[],
    alignments: ListeningTranscriptQuestionAlignmentDto[] = [],
    parts: CreateListeningPartDto[] = [],
): ListeningTranscriptQuestionAlignmentDto[] => {
    const groupTypeByQuestionNumber = buildListeningTranscriptGroupTypeLookup(parts);

    return hydrateListeningTranscriptAlignments(
        segments,
        alignments.map((alignment) => ({
            ...alignment,
            groupType: alignment.groupType ?? groupTypeByQuestionNumber.get(alignment.questionNumber) ?? null,
        })),
    ).map((alignment) => ({
        questionNumber: alignment.questionNumber,
        segmentIndexes: alignment.segmentIndexes,
        confidence: alignment.confidence ?? null,
        groupType: alignment.groupType ?? null,
        answerStartTime: alignment.answerStartTime ?? null,
        answerEndTime: alignment.answerEndTime ?? null,
        evidenceText: alignment.evidenceText ?? null,
    }));
};

export const applyListeningTranscriptQuestionAlignments = (
    segments: ListeningTranscriptSegmentDto[],
    alignments: ListeningTranscriptQuestionAlignmentDto[] = [],
): ListeningTranscriptSegmentDto[] => {
    const matchesBySegment = new Map<number, number[]>();

    alignments.forEach((alignment) => {
        if (!alignment.questionNumber || !alignment.segmentIndexes?.length) {
            return;
        }

        alignment.segmentIndexes
            .filter((segmentIndex) => Number.isInteger(segmentIndex) && segmentIndex >= 0 && segmentIndex < segments.length)
            .forEach((segmentIndex) => {
                matchesBySegment.set(segmentIndex, [
                    ...(matchesBySegment.get(segmentIndex) ?? []),
                    alignment.questionNumber,
                ]);
            });
    });

    return segments.map((segment, index) => {
        const questionNumbers = Array.from(new Set(matchesBySegment.get(index) ?? [])).sort((left, right) => left - right);
        return {
            ...segment,
            isTargetForQuestion: questionNumbers.length === 0
                ? null
                : questionNumbers.length === 1
                    ? questionNumbers[0]
                    : questionNumbers,
        };
    });
};

const segmentContainsCandidate = (segmentText: string, candidate: string) => {
    if (!candidate) {
        return false;
    }

    if (candidate.length <= 3) {
        return new RegExp(`(^|[^a-z0-9])${candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i').test(segmentText);
    }

    return segmentText.includes(candidate);
};

const scoreTranscriptWindow = ({
    windowText,
    rawText,
    answerCandidates,
    evidenceTokens,
    keywordTokens,
}: {
    windowText: string;
    rawText: string;
    answerCandidates: string[];
    evidenceTokens: string[];
    keywordTokens: string[];
}) => {
    let score = 0;
    const normalizedWindowTokens = extractTranscriptTokens(windowText);
    let evidenceMatchCount = 0;
    let hasDirectCandidateMatch = false;
    const requiresDirectEvidence = answerCandidates.length > 0 || evidenceTokens.length > 0;

    answerCandidates.forEach((candidate) => {
        if (!candidate) {
            return;
        }

        if (segmentContainsCandidate(windowText, candidate)) {
            score += candidate.length >= 8 ? 18 : 14;
            hasDirectCandidateMatch = true;
            return;
        }

        const candidateTokens = candidate.split(' ').filter(Boolean);
        if (candidateTokens.length >= 2) {
            const matchedTokens = candidateTokens.filter((token) => {
                const variants = buildTranscriptTokenVariants(token);
                return Array.from(variants).some((variant) => normalizedWindowTokens.has(variant));
            }).length;
            if (matchedTokens === candidateTokens.length) {
                score += 10;
                hasDirectCandidateMatch = true;
                return;
            }

            if (matchedTokens >= Math.max(2, Math.ceil(candidateTokens.length * 0.66))) {
                score += 5;
            }
        }
    });

    evidenceTokens.forEach((token) => {
        if (normalizedWindowTokens.has(token)) {
            evidenceMatchCount += 1;
            score += token.length >= 6 ? 4 : 3;
        }
    });

    if (requiresDirectEvidence && !hasDirectCandidateMatch && evidenceMatchCount === 0) {
        return 0;
    }

    keywordTokens.forEach((token) => {
        if (normalizedWindowTokens.has(token)) {
            score += requiresDirectEvidence
                ? (token.length >= 6 ? 0.25 : 0.1)
                : (token.length >= 6 ? 0.75 : 0.5);
        }
    });

    if (looksLikeTranscriptIntroSegment(rawText)) {
        if (hasDirectCandidateMatch) {
            score -= 2;
        } else if (evidenceMatchCount > 0) {
            score -= 8;
        } else {
            score -= 18;
        }
    }

    if (!requiresDirectEvidence && !hasDirectCandidateMatch && evidenceMatchCount === 0 && score < 2.5) {
        return 0;
    }

    return Math.max(0, score);
};

export const autoMapTranscriptSegmentsToQuestions = (
    segments: ListeningTranscriptSegmentDto[],
    partsOrPart: CreateListeningPartDto[] | CreateListeningPartDto,
): ListeningTranscriptSegmentDto[] => {
    const listeningParts = Array.isArray(partsOrPart) ? partsOrPart : [partsOrPart];
    const questions = collectListeningQuestions(listeningParts);
    if (segments.length === 0 || questions.length === 0) {
        return segments;
    }

    const normalizedSegmentTexts = segments.map((segment) => normalizeTranscriptMatchText(segment.text));
    const matchesBySegment = new Map<number, number[]>();

    questions.forEach((question) => {
        if (question.questionNumber == null) {
            return;
        }

        const answerCandidates = getQuestionAnswerCandidates(question);
        const evidenceTokens = getQuestionEvidenceTokens(question);
        const keywordTokens = getQuestionKeywordTokens(question);

        if (answerCandidates.length === 0 && evidenceTokens.length === 0 && keywordTokens.length === 0) {
            return;
        }

        let bestWindow:
            | { startIndex: number; endIndex: number; score: number }
            | null = null;

        for (let startIndex = 0; startIndex < normalizedSegmentTexts.length; startIndex += 1) {
            const endIndex = startIndex;
            const windowText = normalizedSegmentTexts[startIndex];
            const score = scoreTranscriptWindow({
                windowText,
                rawText: segments[startIndex].text,
                answerCandidates,
                evidenceTokens,
                keywordTokens,
            });

            if (score <= 0) {
                continue;
            }

            if (!bestWindow || score > bestWindow.score) {
                bestWindow = { startIndex, endIndex, score };
            }
        }

        const minimumScore = answerCandidates.length > 0 || evidenceTokens.length > 0 ? 3 : 2.5;
        if (!bestWindow || bestWindow.score < minimumScore) {
            return;
        }

        matchesBySegment.set(bestWindow.startIndex, [
            ...(matchesBySegment.get(bestWindow.startIndex) ?? []),
            question.questionNumber,
        ]);
    });

    return segments.map((segment, index) => {
        const questionNumbers = Array.from(new Set(matchesBySegment.get(index) ?? [])).sort((left, right) => left - right);
        if (questionNumbers.length === 0) {
            return {
                ...segment,
                isTargetForQuestion: null,
            };
        }

        return {
            ...segment,
            isTargetForQuestion: questionNumbers.length === 1 ? questionNumbers[0] : questionNumbers,
        };
    });
};

export const buildListeningTranscriptQuestionAlignmentsFromMappedSegments = (
    mappedSegments: ListeningTranscriptSegmentDto[],
    partsOrPart: CreateListeningPartDto[] | CreateListeningPartDto,
): ListeningTranscriptQuestionAlignmentDto[] => {
    const listeningParts = Array.isArray(partsOrPart) ? partsOrPart : [partsOrPart];
    const groupTypeByQuestionNumber = buildListeningTranscriptGroupTypeLookup(listeningParts);
    const questionNumbers = [...new Set(
        mappedSegments.flatMap((segment) => {
            const value = segment.isTargetForQuestion;
            if (Array.isArray(value)) {
                return value;
            }

            return typeof value === 'number' ? [value] : [];
        }),
    )].sort((left, right) => left - right);

    return hydrateListeningTranscriptAlignments(
        mappedSegments,
        questionNumbers.map((questionNumber) => ({
            questionNumber,
            segmentIndexes: mappedSegments.flatMap((segment, index) => {
                const value = segment.isTargetForQuestion;
                const questionTargets = Array.isArray(value)
                    ? value
                    : typeof value === 'number'
                        ? [value]
                        : [];

                return questionTargets.includes(questionNumber) ? [index] : [];
            }),
            confidence: 'low',
            groupType: groupTypeByQuestionNumber.get(questionNumber) ?? null,
        })),
    )
        .filter((alignment) => alignment.segmentIndexes.length > 0)
        .map((alignment) => ({
            questionNumber: alignment.questionNumber,
            segmentIndexes: alignment.segmentIndexes,
            confidence: alignment.confidence ?? null,
            groupType: alignment.groupType ?? null,
            answerStartTime: alignment.answerStartTime ?? null,
            answerEndTime: alignment.answerEndTime ?? null,
            evidenceText: alignment.evidenceText ?? null,
        }));
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

import { cleanUpText, buildCleanPastedValue } from '@/shared/utils/input';

export { cleanUpText, buildCleanPastedValue };
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
