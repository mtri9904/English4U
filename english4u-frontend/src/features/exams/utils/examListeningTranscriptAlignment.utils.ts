import type {
    CreateListeningPartDto,
    CreateQuestionDto,
    CreateQuestionGroupDto,
    ListeningTranscriptAlignmentQuestionDto,
    ListeningTranscriptQuestionAlignmentDto,
    ListeningTranscriptSegmentDto,
} from '@/features/exams/types/exam.types';
import { hydrateListeningTranscriptAlignments } from '@/shared/lib/listeningTranscript';
import { getOptionLabel } from '@/shared/utils/optionLabel.utils';

export const normalizeTranscriptMatchText = (value?: string | null) => (
    (value ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9.%/$&+' -]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
);

export const splitAnswerCandidates = (value?: string | null) => (
    (value ?? '')
        .split('|')
        .map((item) => normalizeTranscriptMatchText(item))
        .filter((item) => item.length >= 2)
);

export const transcriptStopwords = new Set([
    'the', 'and', 'that', 'this', 'with', 'from', 'into', 'your', 'their', 'there', 'about', 'would', 'could',
    'should', 'have', 'has', 'had', 'were', 'was', 'been', 'being', 'while', 'where', 'when', 'which', 'what',
    'then', 'than', 'them', 'they', 'those', 'these', 'just', 'also', 'only', 'more', 'most', 'very',
    'much', 'many', 'some', 'such', 'over', 'under', 'after', 'before', 'because', 'through', 'during', 'between',
    'each', 'other', 'another', 'into', 'onto', 'upon', 'across', 'around', 'within', 'without', 'against', 'among',
    'student', 'students', 'answer', 'question', 'questions', 'listening', 'part', 'section',
]);

export const transcriptIntroPhrases = [
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

export const buildTranscriptTokenVariants = (token: string) => {
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

export const extractTranscriptTokens = (value?: string | null) => {
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

export const looksLikeTranscriptIntroSegment = (rawText: string) => {
    const normalized = normalizeTranscriptMatchText(rawText);
    return transcriptIntroPhrases.some((phrase) => normalized.includes(phrase));
};

export const listeningQuestionNumberWordValues: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    twenty: 20,
    thirty: 30,
    forty: 40,
};

export const parseListeningQuestionNumberToken = (token: string) => {
    const normalized = normalizeTranscriptMatchText(token);
    const numericValue = Number(normalized);
    if (Number.isFinite(numericValue)) {
        return numericValue;
    }

    if (listeningQuestionNumberWordValues[normalized] != null) {
        return listeningQuestionNumberWordValues[normalized];
    }

    const compoundMatch = normalized.match(/^(twenty|thirty|forty)\s+(one|two|three|four|five|six|seven|eight|nine)$/);
    if (!compoundMatch) {
        return null;
    }

    return listeningQuestionNumberWordValues[compoundMatch[1]] + listeningQuestionNumberWordValues[compoundMatch[2]];
};

const listeningQuestionNumberTokenPattern = [
    '\\d+',
    'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
    'twenty(?:\\s+(?:one|two|three|four|five|six|seven|eight|nine))?',
    'thirty(?:\\s+(?:one|two|three|four|five|six|seven|eight|nine))?',
    'forty',
].join('|');

export const parseQuestionRangeFromTranscriptText = (value?: string | null) => {
    const normalized = normalizeTranscriptMatchText(value);
    if (!normalized) {
        return null;
    }

    const match = normalized.match(new RegExp(`\\bquestions?\\s+(${listeningQuestionNumberTokenPattern})\\s*(?:to|-|through)\\s*(${listeningQuestionNumberTokenPattern})\\b`));
    if (!match) {
        return null;
    }

    const startQuestion = parseListeningQuestionNumberToken(match[1]);
    const endQuestion = parseListeningQuestionNumberToken(match[2]);
    if (startQuestion == null || endQuestion == null || startQuestion > endQuestion) {
        return null;
    }

    return { startQuestion, endQuestion };
};

export const detectTranscriptQuestionScopes = (segments: Array<{ text?: string | null }>) => {
    const maxSegmentIndex = Math.max(segments.length - 1, 0);
    const events: Array<{
        firstSegmentIndex: number;
        lastSegmentIndex: number;
        startQuestion: number;
        endQuestion: number;
    }> = [];

    segments.forEach((segment, index) => {
        let eventSegmentIndex = index;
        let questionRange = parseQuestionRangeFromTranscriptText(segment.text);
        if (!questionRange && segments[index + 1]) {
            questionRange = parseQuestionRangeFromTranscriptText(`${segment.text ?? ''} ${segments[index + 1].text ?? ''}`);
            eventSegmentIndex = index + 1;
        }

        if (!questionRange) {
            return;
        }

        const previousEvent = events[events.length - 1];
        if (previousEvent
            && previousEvent.startQuestion === questionRange.startQuestion
            && previousEvent.endQuestion === questionRange.endQuestion) {
            events[events.length - 1] = {
                firstSegmentIndex: Math.min(previousEvent.firstSegmentIndex, eventSegmentIndex),
                lastSegmentIndex: Math.max(previousEvent.lastSegmentIndex, eventSegmentIndex),
                startQuestion: questionRange.startQuestion,
                endQuestion: questionRange.endQuestion,
            };
            return;
        }

        events.push({
            firstSegmentIndex: eventSegmentIndex,
            lastSegmentIndex: eventSegmentIndex,
            startQuestion: questionRange.startQuestion,
            endQuestion: questionRange.endQuestion,
        });
    });

    return events.map((event, index) => {
        const nextEvent = events[index + 1];
        const startSegmentIndex = Math.min(event.lastSegmentIndex + 1, maxSegmentIndex);
        const endSegmentIndex = nextEvent
            ? Math.min(nextEvent.firstSegmentIndex - 1, maxSegmentIndex)
            : maxSegmentIndex;

        return {
            startQuestion: event.startQuestion,
            endQuestion: event.endQuestion,
            startSegmentIndex,
            endSegmentIndex,
        };
    });
};

export const findTranscriptQuestionScope = (
    segments: Array<{ text?: string | null }>,
    questionNumber?: number | null,
) => {
    if (questionNumber == null || segments.length === 0) {
        return null;
    }

    return detectTranscriptQuestionScopes(segments)
        .find((scope) => scope.startQuestion <= questionNumber && questionNumber <= scope.endQuestion) ?? null;
};

export const getQuestionOptionsForAlignment = (
    group: CreateQuestionGroupDto,
    question: CreateQuestionDto,
) => (
    (question.options?.length ? question.options : group.questions.find((item) => item.options?.length)?.options) ?? []
);

export const splitAlignmentAnswerTokens = (value?: string | null) => (
    (value ?? '')
        .split('|')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
);

export const resolveQuestionCorrectOptionTexts = (
    group: CreateQuestionGroupDto,
    question: CreateQuestionDto,
) => {
    const options = getQuestionOptionsForAlignment(group, question);
    const directMarkedTexts = options
        .filter((option) => option.isCorrect && option.optionText?.trim())
        .map((option) => option.optionText.trim());

    const labelType = group.optionLabelType ?? 'alpha';
    const answerTokens = splitAlignmentAnswerTokens(question.correctAnswer);
    const resolvedTexts = answerTokens.flatMap((token) => {
        const matchingIndex = options.findIndex((_, index) => (
            getOptionLabel(index, labelType).toLowerCase() === token.toLowerCase()
        ));

        if (matchingIndex < 0) {
            return [];
        }

        const optionText = options[matchingIndex]?.optionText?.trim();
        return optionText ? [optionText] : [];
    });

    return Array.from(new Set(resolvedTexts.length > 0 ? resolvedTexts : directMarkedTexts));
};

export const getQuestionAnswerCandidates = (group: CreateQuestionGroupDto, question: CreateQuestionDto) => {
    const options = getQuestionOptionsForAlignment(group, question);
    const optionLabels = new Set(options.map((_, index) => (
        normalizeTranscriptMatchText(getOptionLabel(index, group.optionLabelType ?? 'alpha'))
    )));
    const directAnswers = splitAnswerCandidates(question.correctAnswer)
        .filter((candidate) => !optionLabels.has(candidate));
    const correctOptionTexts = resolveQuestionCorrectOptionTexts(group, question)
        .map((optionText) => normalizeTranscriptMatchText(optionText))
        .filter((item) => item.length >= 2);

    return Array.from(new Set([...directAnswers, ...correctOptionTexts]));
};

export const getQuestionEvidenceTokens = (group: CreateQuestionGroupDto, question: CreateQuestionDto) => {
    const tokens = new Set<string>();

    getQuestionAnswerCandidates(group, question).forEach((candidate) => {
        extractTranscriptTokens(candidate).forEach((token) => {
            tokens.add(token);
        });
    });

    return Array.from(tokens).filter((token) => token.length >= 3 && !transcriptStopwords.has(token));
};

export const getQuestionKeywordTokens = (question: CreateQuestionDto) => {
    const normalizedContent = normalizeTranscriptMatchText(question.content);
    if (!normalizedContent) {
        return [];
    }

    return normalizedContent
        .split(' ')
        .filter((token) => token.length >= 3 && !transcriptStopwords.has(token));
};

export const collectListeningQuestions = (parts: CreateListeningPartDto[] = []) => (
    parts
        .flatMap((part) => part.questionGroups ?? [])
        .flatMap((group) => (group.questions ?? []).map((question) => ({ group, question })))
        .filter(({ question }) => question.questionNumber != null)
        .sort((left, right) => (
            (left.question.questionNumber ?? Number.MAX_SAFE_INTEGER) - (right.question.questionNumber ?? Number.MAX_SAFE_INTEGER)
        ))
);

export const extractQuestionSpecificGroupContentContext = (
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

export const extractAlignmentContextText = (part: CreateListeningPartDto, group: CreateQuestionGroupDto, question: CreateQuestionDto) => (
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

export const buildListeningTranscriptGroupTypeLookup = (parts: CreateListeningPartDto[] = []) => {
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

export const segmentContainsCandidate = (segmentText: string, candidate: string) => {
    if (!candidate) {
        return false;
    }

    if (candidate.length <= 3) {
        return new RegExp(`(^|[^a-z0-9])${candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i').test(segmentText);
    }

    return segmentText.includes(candidate);
};

export const scoreTranscriptWindow = ({
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

    questions.forEach(({ group, question }) => {
        if (question.questionNumber == null) {
            return;
        }

        const answerCandidates = getQuestionAnswerCandidates(group, question);
        const evidenceTokens = getQuestionEvidenceTokens(group, question);
        const keywordTokens = getQuestionKeywordTokens(question);

        if (answerCandidates.length === 0 && evidenceTokens.length === 0 && keywordTokens.length === 0) {
            return;
        }

        let bestWindow:
            | { startIndex: number; endIndex: number; score: number }
            | null = null;

        const questionScope = findTranscriptQuestionScope(segments, question.questionNumber);
        const searchStartIndex = questionScope?.startSegmentIndex ?? 0;
        const searchEndIndex = questionScope?.endSegmentIndex ?? normalizedSegmentTexts.length - 1;

        for (let startIndex = searchStartIndex; startIndex <= searchEndIndex; startIndex += 1) {
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

