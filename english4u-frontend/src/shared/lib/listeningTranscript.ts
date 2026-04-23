export interface ListeningTranscriptSegment {
    startTime: number;
    endTime: number | null;
    text: string;
    targetQuestionNumbers: number[];
}

export interface ListeningTranscriptAlignment {
    questionNumber: number;
    segmentIndexes: number[];
    confidence?: 'high' | 'medium' | 'low' | null;
    groupType?: string | null;
    answerStartTime?: number | null;
    answerEndTime?: number | null;
    evidenceText?: string | null;
}

export interface ParsedListeningTranscriptData {
    schemaVersion: number | null;
    segments: ListeningTranscriptSegment[];
    alignments: ListeningTranscriptAlignment[];
    transcriptText: string | null;
    segmentCount: number;
}

export interface ListeningTranscriptSerializableSegment {
    startTime: number;
    endTime: number | null;
    text: string;
    isTargetForQuestion?: number | number[] | null;
    targetQuestionNumbers?: number[] | null;
    questionNumbers?: number[] | null;
    questionNumber?: number | null;
}

export interface ListeningTranscriptSerializeInput {
    segments: ListeningTranscriptSerializableSegment[];
    alignments?: ListeningTranscriptAlignment[];
    transcriptText?: string | null;
    segmentCount?: number | null;
    schemaVersion?: number | null;
}

export interface ListeningTranscriptReplayMatch {
    startTime: number;
    endTime: number | null;
    text: string;
    targetQuestionNumbers: number[];
    segmentCount: number;
}

export interface InferredCopilotReplayMatch {
    answerStartSecond: number;
    answerEndSecond: number | null;
    answerTimestampLabel: string;
    questionNumber?: number | null;
    transcriptSnippet?: string | null;
}

export interface ListeningTranscriptPartSplitResult {
    segmentsByPart: ListeningTranscriptSegment[][];
    detectedBoundaryCount: number;
    usedDetectedBoundaries: boolean;
}

interface ListeningTranscriptSnippetLookupOptions {
    questionNumber?: number | null;
    toleranceSeconds?: number;
}

const toFiniteNumber = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string') {
        const parsed = Number(value.trim());
        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
};

const toQuestionNumbers = (value: unknown): number[] => {
    if (Array.isArray(value)) {
        return [...new Set(
            value
                .map((item) => toFiniteNumber(item))
                .filter((item): item is number => item != null)
                .map((item) => Math.trunc(item))
                .filter((item) => item > 0),
        )];
    }

    if (typeof value === 'string') {
        return [...new Set(
            value
                .split(/[^\d]+/g)
                .map((item) => Number(item))
                .filter((item) => Number.isFinite(item) && item > 0)
                .map((item) => Math.trunc(item)),
        )];
    }

    const numericValue = toFiniteNumber(value);
    if (numericValue == null) {
        return [];
    }

    const questionNumber = Math.trunc(numericValue);
    return questionNumber > 0 ? [questionNumber] : [];
};

const normalizeSegmentText = (value: unknown) => (
    typeof value === 'string'
        ? value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
        : ''
);

const normalizeInferredSnippetText = (value?: string | null) => (
    (value ?? '')
        .replace(/\[\d{1,2}:\d{2}(?::\d{2})?\s*[-–—]\s*\d{1,2}:\d{2}(?::\d{2})?\]/g, ' ')
        .replace(/([A-Za-z])(\d)/g, '$1 $2')
        .replace(/(\d)([A-Za-z])/g, '$1 $2')
        .replace(/\s+([,.;!?])/g, '$1')
        .replace(/\(\s+/g, '(')
        .replace(/\s+\)/g, ')')
        .replace(/[ \t]{2,}/g, ' ')
        .trim()
);

const dedupeQuestionNumbers = (questionNumbers: number[]) => (
    questionNumbers.filter((questionNumber, index, array) => array.indexOf(questionNumber) === index)
);

const normalizeSegmentQuestionNumbers = (rawSegment: Record<string, unknown>) => dedupeQuestionNumbers([
    ...toQuestionNumbers(rawSegment.isTargetForQuestion),
    ...toQuestionNumbers(rawSegment.targetQuestionNumbers),
    ...toQuestionNumbers(rawSegment.questionNumbers),
    ...toQuestionNumbers(rawSegment.questionNumber),
]);

const normalizeTranscriptSegments = (value: unknown): ListeningTranscriptSegment[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.flatMap((item) => {
        if (!item || typeof item !== 'object') {
            return [];
        }

        const rawSegment = item as Record<string, unknown>;
        const startTime = toFiniteNumber(rawSegment.startTime ?? rawSegment.start ?? rawSegment.from);
        const endTime = toFiniteNumber(rawSegment.endTime ?? rawSegment.end ?? rawSegment.to);
        const text = normalizeSegmentText(rawSegment.text ?? rawSegment.content ?? rawSegment.transcript);
        const targetQuestionNumbers = normalizeSegmentQuestionNumbers(rawSegment);

        if (startTime == null || !text) {
            return [];
        }

        return [{
            startTime,
            endTime,
            text,
            targetQuestionNumbers,
        }];
    });
};

const listeningPartNumberWords: Record<string, number> = {
    '1': 1,
    one: 1,
    first: 1,
    '2': 2,
    two: 2,
    second: 2,
    '3': 3,
    three: 3,
    third: 3,
    '4': 4,
    four: 4,
    fourth: 4,
};

const listeningQuestionNumberWords: Record<string, number> = {
    '1': 1,
    one: 1,
    '2': 2,
    two: 2,
    '3': 3,
    three: 3,
    '4': 4,
    four: 4,
    '5': 5,
    five: 5,
    '6': 6,
    six: 6,
    '7': 7,
    seven: 7,
    '8': 8,
    eight: 8,
    '9': 9,
    nine: 9,
    '10': 10,
    ten: 10,
    '11': 11,
    eleven: 11,
    '12': 12,
    twelve: 12,
    '13': 13,
    thirteen: 13,
    '14': 14,
    fourteen: 14,
    '15': 15,
    fifteen: 15,
    '16': 16,
    sixteen: 16,
    '17': 17,
    seventeen: 17,
    '18': 18,
    eighteen: 18,
    '19': 19,
    nineteen: 19,
    '20': 20,
    twenty: 20,
    '30': 30,
    thirty: 30,
    '40': 40,
    forty: 40,
};

interface ListeningTranscriptPartBoundaryMarker {
    partNumber: number;
    boundaryOffset: 0 | 1;
    priority: number;
}

const normalizeListeningMarkerText = (text: string) => (
    text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
);

const parseLeadingQuestionNumber = (tokens: string[], startIndex: number) => {
    const firstToken = tokens[startIndex];
    if (!firstToken) {
        return null;
    }

    const direct = listeningQuestionNumberWords[firstToken];
    if (direct == null) {
        return null;
    }

    const secondToken = tokens[startIndex + 1];
    const secondValue = secondToken ? listeningQuestionNumberWords[secondToken] : null;
    if ((direct === 20 || direct === 30) && secondValue != null && secondValue > 0 && secondValue < 10) {
        return { value: direct + secondValue, nextIndex: startIndex + 2 };
    }

    return { value: direct, nextIndex: startIndex + 1 };
};

const getPartNumberForQuestion = (questionNumber: number, partCount: number) => (
    Math.min(Math.max(1, Math.ceil(questionNumber / 10)), partCount)
);

const parseQuestionRangePartMarker = (normalized: string, partCount: number) => {
    const tokens = normalized.split(/\s+/).filter(Boolean);

    for (let index = 0; index < tokens.length; index += 1) {
        if (tokens[index] !== 'question' && tokens[index] !== 'questions') {
            continue;
        }

        const firstNumber = parseLeadingQuestionNumber(tokens, index + 1);
        if (!firstNumber) {
            continue;
        }

        const separator = tokens[firstNumber.nextIndex];
        if (separator !== 'to' && separator !== 'through') {
            continue;
        }

        const secondNumber = parseLeadingQuestionNumber(tokens, firstNumber.nextIndex + 1);
        if (!secondNumber) {
            continue;
        }

        return getPartNumberForQuestion(Math.min(firstNumber.value, secondNumber.value), partCount);
    }

    return null;
};

const parseListeningTranscriptPartBoundaryMarker = (
    text: string,
    partCount: number,
): ListeningTranscriptPartBoundaryMarker | null => {
    const normalized = text
        ? normalizeListeningMarkerText(text)
        : '';
    if (!normalized) {
        return null;
    }

    const questionRangePart = parseQuestionRangePartMarker(normalized, partCount);
    if (questionRangePart != null) {
        return {
            partNumber: questionRangePart,
            boundaryOffset: 0,
            priority: 3,
        };
    }

    const turnMatch = normalized.match(/\bturn to (?:section|part) (1|2|3|4|one|two|three|four|first|second|third|fourth)\b/);
    if (turnMatch) {
        return {
            partNumber: listeningPartNumberWords[turnMatch[1]] ?? 1,
            boundaryOffset: 1,
            priority: 1,
        };
    }

    if (/\bend of (?:section|part)\b/.test(normalized)) {
        return null;
    }

    const startMatch = normalized.match(/\b(?:section|part) (1|2|3|4|one|two|three|four|first|second|third|fourth)\b/);
    if (startMatch) {
        return {
            partNumber: listeningPartNumberWords[startMatch[1]] ?? 1,
            boundaryOffset: 0,
            priority: 2,
        };
    }

    return null;
};

export const splitListeningTranscriptSegmentsByPart = (
    segments: ListeningTranscriptSerializableSegment[],
    partCount: number,
): ListeningTranscriptPartSplitResult => {
    const normalizedSegments = normalizeTranscriptSegments(segments);
    const effectivePartCount = Math.max(1, Math.trunc(partCount || 1));

    if (normalizedSegments.length === 0) {
        return {
            segmentsByPart: Array.from({ length: effectivePartCount }, () => []),
            detectedBoundaryCount: 0,
            usedDetectedBoundaries: false,
        };
    }

    if (effectivePartCount === 1) {
        return {
            segmentsByPart: [normalizedSegments],
            detectedBoundaryCount: 0,
            usedDetectedBoundaries: false,
        };
    }

    const boundaryIndexByPart = new Map<number, { index: number; priority: number }>();
    normalizedSegments.forEach((segment, index) => {
        const marker = parseListeningTranscriptPartBoundaryMarker(segment.text, effectivePartCount);
        if (!marker || marker.partNumber < 1 || marker.partNumber > effectivePartCount) {
            return;
        }

        const boundaryIndex = index + marker.boundaryOffset;
        if (boundaryIndex < 0 || boundaryIndex >= normalizedSegments.length) {
            return;
        }

        const existing = boundaryIndexByPart.get(marker.partNumber);
        if (
            !existing
            || boundaryIndex < existing.index
            || (boundaryIndex === existing.index && marker.priority > existing.priority)
        ) {
            boundaryIndexByPart.set(marker.partNumber, { index: boundaryIndex, priority: marker.priority });
        }
    });

    if (!boundaryIndexByPart.has(1)) {
        boundaryIndexByPart.set(1, { index: 0, priority: 0 });
    }

    const sortedBoundaries = [...boundaryIndexByPart.entries()]
        .sort((left, right) => left[0] - right[0])
        .map(([partNumber, boundary]) => [partNumber, boundary.index] as const)
        .filter(([, index]) => index >= 0 && index < normalizedSegments.length);
    const usedDetectedBoundaries = sortedBoundaries.length >= 2;

    if (!usedDetectedBoundaries) {
        return {
            segmentsByPart: Array.from({ length: effectivePartCount }, () => normalizedSegments),
            detectedBoundaryCount: sortedBoundaries.length,
            usedDetectedBoundaries: false,
        };
    }

    const segmentsByPart = Array.from({ length: effectivePartCount }, (_, partIndex) => {
        const partNumber = partIndex + 1;
        const startIndex = boundaryIndexByPart.get(partNumber)?.index;
        if (startIndex == null) {
            return [];
        }

        const nextBoundary = sortedBoundaries.find(([candidatePartNumber]) => candidatePartNumber > partNumber);
        const endIndexExclusive = nextBoundary ? nextBoundary[1] : normalizedSegments.length;
        const partSegments = normalizedSegments.slice(startIndex, Math.max(startIndex + 1, endIndexExclusive));
        return partSegments.length > 0 ? partSegments : normalizedSegments;
    });

    return {
        segmentsByPart,
        detectedBoundaryCount: sortedBoundaries.length,
        usedDetectedBoundaries,
    };
};

const buildQuestionNumbersBySegmentIndex = (
    alignments: ListeningTranscriptAlignment[],
    segmentCount: number,
) => {
    const questionNumbersBySegmentIndex = new Map<number, number[]>();

    alignments.forEach((alignment) => {
        alignment.segmentIndexes
            .filter((segmentIndex) => Number.isInteger(segmentIndex) && segmentIndex >= 0 && segmentIndex < segmentCount)
            .forEach((segmentIndex) => {
                questionNumbersBySegmentIndex.set(segmentIndex, dedupeQuestionNumbers([
                    ...(questionNumbersBySegmentIndex.get(segmentIndex) ?? []),
                    alignment.questionNumber,
                ]));
            });
    });

    return questionNumbersBySegmentIndex;
};

const normalizeAlignmentText = (segments: ListeningTranscriptSegment[], segmentIndexes: number[]) => (
    normalizeInferredSnippetText(
        segmentIndexes
            .filter((segmentIndex) => segmentIndex >= 0 && segmentIndex < segments.length)
            .map((segmentIndex) => segments[segmentIndex].text)
            .join(' '),
    ) || null
);

const hydrateListeningTranscriptAlignment = (
    alignment: ListeningTranscriptAlignment,
    segments: ListeningTranscriptSegment[],
): ListeningTranscriptAlignment | null => {
    if (!alignment.questionNumber || alignment.questionNumber <= 0) {
        return null;
    }

    const segmentIndexes = [...new Set(
        alignment.segmentIndexes
            .map((segmentIndex) => Math.trunc(segmentIndex))
            .filter((segmentIndex) => Number.isInteger(segmentIndex) && segmentIndex >= 0 && segmentIndex < segments.length),
    )].sort((left, right) => left - right);
    if (segmentIndexes.length === 0) {
        return {
            ...alignment,
            questionNumber: Math.trunc(alignment.questionNumber),
            segmentIndexes: [],
            answerStartTime: alignment.answerStartTime ?? null,
            answerEndTime: alignment.answerEndTime ?? null,
            evidenceText: normalizeInferredSnippetText(alignment.evidenceText) || null,
        };
    }

    const firstSegment = segments[segmentIndexes[0]];
    const lastSegment = segments[segmentIndexes[segmentIndexes.length - 1]];

    return {
        ...alignment,
        questionNumber: Math.trunc(alignment.questionNumber),
        segmentIndexes,
        answerStartTime: alignment.answerStartTime ?? firstSegment.startTime,
        answerEndTime: alignment.answerEndTime ?? lastSegment.endTime ?? lastSegment.startTime,
        evidenceText: normalizeInferredSnippetText(alignment.evidenceText) || normalizeAlignmentText(segments, segmentIndexes),
    };
};

const normalizeTranscriptAlignments = (
    value: unknown,
    segments: ListeningTranscriptSegment[],
): ListeningTranscriptAlignment[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.flatMap((item) => {
        if (!item || typeof item !== 'object') {
            return [];
        }

        const rawAlignment = item as Record<string, unknown>;
        const questionNumber = toFiniteNumber(rawAlignment.questionNumber ?? rawAlignment.question);
        if (questionNumber == null || questionNumber <= 0) {
            return [];
        }

        const alignment = hydrateListeningTranscriptAlignment({
            questionNumber: Math.trunc(questionNumber),
            segmentIndexes: [
                ...new Set(
                    (Array.isArray(rawAlignment.segmentIndexes) ? rawAlignment.segmentIndexes : [])
                        .map((segmentIndex) => toFiniteNumber(segmentIndex))
                        .filter((segmentIndex): segmentIndex is number => segmentIndex != null)
                        .map((segmentIndex) => Math.trunc(segmentIndex)),
                ),
            ],
            confidence: typeof rawAlignment.confidence === 'string'
                ? rawAlignment.confidence as 'high' | 'medium' | 'low'
                : null,
            groupType: typeof rawAlignment.groupType === 'string'
                ? rawAlignment.groupType.trim() || null
                : null,
            answerStartTime: toFiniteNumber(rawAlignment.answerStartTime ?? rawAlignment.startTime),
            answerEndTime: toFiniteNumber(rawAlignment.answerEndTime ?? rawAlignment.endTime),
            evidenceText: typeof rawAlignment.evidenceText === 'string'
                ? rawAlignment.evidenceText
                : typeof rawAlignment.text === 'string'
                    ? rawAlignment.text
                    : null,
        }, segments);

        return alignment ? [alignment] : [];
    });
};

const buildAlignmentsFromSegments = (segments: ListeningTranscriptSegment[]): ListeningTranscriptAlignment[] => {
    const questionNumbers = [...new Set(
        segments.flatMap((segment) => segment.targetQuestionNumbers),
    )].sort((left, right) => left - right);

    return questionNumbers.map((questionNumber) => {
        const segmentIndexes = segments.flatMap((segment, index) => (
            segment.targetQuestionNumbers.includes(questionNumber) ? [index] : []
        ));
        return hydrateListeningTranscriptAlignment({
            questionNumber,
            segmentIndexes,
            confidence: null,
            groupType: null,
            answerStartTime: null,
            answerEndTime: null,
            evidenceText: null,
        }, segments);
    }).filter((alignment): alignment is ListeningTranscriptAlignment => alignment != null);
};

export const hydrateListeningTranscriptAlignments = (
    segments: ListeningTranscriptSerializableSegment[],
    alignments: ListeningTranscriptAlignment[] = [],
) => {
    const normalizedSegments = normalizeTranscriptSegments(segments);
    return alignments
        .map((alignment) => hydrateListeningTranscriptAlignment(alignment, normalizedSegments))
        .filter((alignment): alignment is ListeningTranscriptAlignment => alignment != null);
};

export const parseListeningTranscriptEnvelope = (value?: string | null): ParsedListeningTranscriptData => {
    const trimmedValue = value?.trim();
    if (!trimmedValue) {
        return {
            schemaVersion: null,
            segments: [],
            alignments: [],
            transcriptText: null,
            segmentCount: 0,
        };
    }

    try {
        const parsed = JSON.parse(trimmedValue) as unknown;
        const schemaVersion = !Array.isArray(parsed) && parsed && typeof parsed === 'object'
            ? toFiniteNumber((parsed as Record<string, unknown>).schemaVersion ?? (parsed as Record<string, unknown>).version)
            : null;
        const rawSegments = Array.isArray(parsed)
            ? parsed
            : (parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>).segments : null);
        const inlineSegments = normalizeTranscriptSegments(rawSegments);
        const rawAlignments = !Array.isArray(parsed) && parsed && typeof parsed === 'object'
            ? (parsed as Record<string, unknown>).alignments
            : null;
        const parsedAlignments = normalizeTranscriptAlignments(rawAlignments, inlineSegments);
        const synthesizedAlignments = parsedAlignments.length > 0
            ? parsedAlignments
            : buildAlignmentsFromSegments(inlineSegments);
        const questionNumbersBySegmentIndex = buildQuestionNumbersBySegmentIndex(synthesizedAlignments, inlineSegments.length);
        const segments = inlineSegments.map((segment, index) => ({
            ...segment,
            targetQuestionNumbers: dedupeQuestionNumbers([
                ...segment.targetQuestionNumbers,
                ...(questionNumbersBySegmentIndex.get(index) ?? []),
            ]).sort((left, right) => left - right),
        }));
        const alignments = synthesizedAlignments.length > 0
            ? synthesizedAlignments
                .map((alignment) => hydrateListeningTranscriptAlignment(alignment, segments))
                .filter((alignment): alignment is ListeningTranscriptAlignment => alignment != null)
            : buildAlignmentsFromSegments(segments);

        return {
            schemaVersion: schemaVersion != null ? Math.trunc(schemaVersion) : (Array.isArray(parsed) ? 1 : null),
            segments,
            alignments,
            transcriptText: !Array.isArray(parsed) && parsed && typeof parsed === 'object'
                ? (typeof (parsed as Record<string, unknown>).transcriptText === 'string'
                    ? (parsed as Record<string, unknown>).transcriptText as string
                    : typeof (parsed as Record<string, unknown>).transcript_text === 'string'
                        ? (parsed as Record<string, unknown>).transcript_text as string
                        : null)
                : null,
            segmentCount: segments.length,
        };
    } catch {
        return {
            schemaVersion: null,
            segments: [],
            alignments: [],
            transcriptText: null,
            segmentCount: 0,
        };
    }
};

export const parseListeningTranscriptData = (value?: string | null): ListeningTranscriptSegment[] => (
    parseListeningTranscriptEnvelope(value).segments
);

export const serializeListeningTranscriptData = ({
    segments,
    schemaVersion = 3,
}: ListeningTranscriptSerializeInput) => {
    const normalizedSegments = normalizeTranscriptSegments(segments);

    return JSON.stringify({
        schemaVersion,
        segments: normalizedSegments.map((segment) => ({
            startTime: segment.startTime,
            endTime: segment.endTime,
            text: segment.text,
        })),
    }, null, 2);
};

export const formatTranscriptTimeLabel = (seconds?: number | null) => {
    if (seconds == null || !Number.isFinite(seconds)) {
        return '00:00';
    }

    const totalSeconds = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const remainingSeconds = totalSeconds % 60;

    if (hours > 0) {
        return [
            String(hours).padStart(2, '0'),
            String(minutes).padStart(2, '0'),
            String(remainingSeconds).padStart(2, '0'),
        ].join(':');
    }

    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
};

export const parseTranscriptTimeLabel = (value?: string | null) => {
    const trimmed = value?.trim();
    if (!trimmed) {
        return null;
    }

    const segments = trimmed.split(':').map((segment) => Number(segment));
    if (segments.some((segment) => !Number.isFinite(segment) || segment < 0)) {
        return null;
    }

    if (segments.length === 2) {
        return (segments[0] * 60) + segments[1];
    }

    if (segments.length === 3) {
        return (segments[0] * 3600) + (segments[1] * 60) + segments[2];
    }

    return null;
};

export const formatTranscriptRangeLabel = (startTime?: number | null, endTime?: number | null) => (
    endTime != null && Number.isFinite(endTime) && endTime > (startTime ?? 0)
        ? `${formatTranscriptTimeLabel(startTime)} - ${formatTranscriptTimeLabel(endTime)}`
        : formatTranscriptTimeLabel(startTime)
);

export const formatListeningTranscriptForCopilot = (
    segments: ListeningTranscriptSegment[],
    maxSegments = 120,
) => (
    segments
        .slice(0, maxSegments)
        .map((segment) => {
            const questionLabel = segment.targetQuestionNumbers.length > 0
                ? ` Q${segment.targetQuestionNumbers.join('/')}`
                : '';
            return `[${formatTranscriptRangeLabel(segment.startTime, segment.endTime)}]${questionLabel} ${segment.text}`;
        })
        .join('\n')
);

const alignmentConfidenceRank = (confidence?: string | null) => {
    if (confidence === 'high') {
        return 3;
    }

    if (confidence === 'medium') {
        return 2;
    }

    if (confidence === 'low') {
        return 1;
    }

    return 0;
};

const REPLAY_EXPANDED_COMPLETION_GROUP_TYPES = new Set([
    'TABLE_COMPLETION',
    'MATCHING_TABLE',
    'NOTE_COMPLETION',
    'FORM_COMPLETION',
    'SUMMARY_COMPLETION',
    'SENTENCE_COMPLETION',
    'FLOWCHART_COMPLETION',
]);

const normalizeReplayGroupType = (value?: string | null) => (
    typeof value === 'string' ? value.trim().toUpperCase() : ''
);

const isReplayClarificationPrompt = (text: string) => (
    /(?:spell|repeat|say that again|what was that|how do you spell|could you spell|can you spell)/i.test(text)
);

const isReplaySpellingSegment = (text: string) => (
    /(?:^|[\s(])(?:[A-Z][-. ]?){3,}(?:$|[\s).,])/u.test(text)
);

const isReplayShortConfirmationSegment = (text: string) => {
    const normalized = normalizeInferredSnippetText(text);
    if (!normalized) {
        return false;
    }

    const tokenCount = normalized.split(/\s+/).filter(Boolean).length;
    return tokenCount <= 4 && /^[A-Z][A-Za-z' -]+[.!?]?$/.test(normalized);
};

const buildExpandedReplaySegmentIndexes = (
    segments: ListeningTranscriptSegment[],
    baseSegmentIndexes: number[],
    groupType?: string | null,
) => {
    if (baseSegmentIndexes.length === 0) {
        return baseSegmentIndexes;
    }

    const normalizedGroupType = normalizeReplayGroupType(groupType);
    if (!REPLAY_EXPANDED_COMPLETION_GROUP_TYPES.has(normalizedGroupType)) {
        return baseSegmentIndexes;
    }

    const expandedIndexes = [...baseSegmentIndexes];
    let lastIncludedIndex = expandedIndexes[expandedIndexes.length - 1];
    let clarificationSeen = false;
    let spellingSeen = false;

    for (let step = 0; step < 4; step += 1) {
        const candidateIndex = lastIncludedIndex + 1;
        if (candidateIndex >= segments.length) {
            break;
        }

        const previousSegment = segments[lastIncludedIndex];
        const candidateSegment = segments[candidateIndex];
        const previousEnd = previousSegment.endTime ?? previousSegment.startTime;
        const gapSeconds = candidateSegment.startTime - previousEnd;
        if (gapSeconds > 2.5) {
            break;
        }

        const candidateText = candidateSegment.text;
        const isClarificationPrompt = isReplayClarificationPrompt(candidateText);
        const isSpellingSegment = isReplaySpellingSegment(candidateText);
        const isShortConfirmation = isReplayShortConfirmationSegment(candidateText);

        const shouldInclude = isClarificationPrompt
            || isSpellingSegment
            || ((clarificationSeen || spellingSeen) && isShortConfirmation);

        if (!shouldInclude) {
            break;
        }

        expandedIndexes.push(candidateIndex);
        lastIncludedIndex = candidateIndex;
        clarificationSeen = clarificationSeen || isClarificationPrompt;
        spellingSeen = spellingSeen || isSpellingSegment;
    }

    return expandedIndexes;
};

export const findListeningReplayMatch = (
    segments: ListeningTranscriptSegment[],
    questionNumber: number,
    alignments: ListeningTranscriptAlignment[] = [],
): ListeningTranscriptReplayMatch | null => {
    const matchedAlignment = alignments
        .filter((alignment) => alignment.questionNumber === questionNumber && alignment.segmentIndexes.length > 0)
        .sort((left, right) => (
            alignmentConfidenceRank(right.confidence) - alignmentConfidenceRank(left.confidence)
            || left.segmentIndexes.length - right.segmentIndexes.length
            || left.segmentIndexes[0] - right.segmentIndexes[0]
        ))[0];
    if (matchedAlignment) {
        const baseMatchedIndexes = [...new Set(
            matchedAlignment.segmentIndexes.filter((segmentIndex) => segmentIndex >= 0 && segmentIndex < segments.length),
        )].sort((left, right) => left - right);
        const matchedIndexes = buildExpandedReplaySegmentIndexes(
            segments,
            baseMatchedIndexes,
            matchedAlignment.groupType,
        );
        if (matchedIndexes.length > 0) {
            const firstSegment = segments[matchedIndexes[0]];
            const lastSegment = segments[matchedIndexes[matchedIndexes.length - 1]];
            const usedExpandedIndexes = matchedIndexes.length > baseMatchedIndexes.length;
            const text = (!usedExpandedIndexes ? normalizeInferredSnippetText(matchedAlignment.evidenceText) : null)
                || normalizeInferredSnippetText(
                    matchedIndexes.map((segmentIndex) => segments[segmentIndex].text).join(' '),
                )
                || matchedIndexes.map((segmentIndex) => segments[segmentIndex].text).join(' ').trim();

            return {
                startTime: matchedAlignment.answerStartTime ?? firstSegment.startTime,
                endTime: Math.max(
                    matchedAlignment.answerEndTime ?? lastSegment.endTime ?? lastSegment.startTime,
                    lastSegment.endTime ?? lastSegment.startTime,
                ),
                text,
                targetQuestionNumbers: [questionNumber],
                segmentCount: matchedIndexes.length,
            };
        }
    }

    const matches = segments.filter((segment) => segment.targetQuestionNumbers.includes(questionNumber));
    if (matches.length === 0) {
        return null;
    }

    const groupedMatches: ListeningTranscriptSegment[] = [matches[0]];
    for (let index = 1; index < matches.length; index += 1) {
        const previousSegment = groupedMatches[groupedMatches.length - 1];
        const currentSegment = matches[index];
        const previousEndTime = previousSegment.endTime ?? previousSegment.startTime;
        if (currentSegment.startTime - previousEndTime > 3) {
            break;
        }

        groupedMatches.push(currentSegment);
    }

    return {
        startTime: groupedMatches[0].startTime,
        endTime: groupedMatches[groupedMatches.length - 1].endTime,
        text: groupedMatches.map((segment) => segment.text).join(' ').trim(),
        targetQuestionNumbers: groupedMatches.flatMap((segment) => segment.targetQuestionNumbers)
            .filter((value, index, array) => array.indexOf(value) === index),
        segmentCount: groupedMatches.length,
    };
};

export const findListeningTranscriptSnippetByTime = (
    segments: ListeningTranscriptSegment[],
    answerStartSecond: number,
    answerEndSecond?: number | null,
    options?: ListeningTranscriptSnippetLookupOptions,
): string | null => {
    if (!Number.isFinite(answerStartSecond) || segments.length === 0) {
        return null;
    }

    const normalizedQuestionNumber = options?.questionNumber ?? null;
    const toleranceSeconds = options?.toleranceSeconds ?? 1.5;
    const effectiveAnswerEnd = answerEndSecond != null && Number.isFinite(answerEndSecond)
        ? answerEndSecond
        : answerStartSecond;

    const indexedSegments = segments.map((segment, index) => ({ segment, index }));
    const overlapsRange = (segment: ListeningTranscriptSegment) => {
        const segmentEnd = segment.endTime ?? segment.startTime;
        return segment.startTime <= effectiveAnswerEnd + toleranceSeconds
            && segmentEnd >= answerStartSecond - toleranceSeconds;
    };
    const isQuestionMatch = (segment: ListeningTranscriptSegment) => (
        normalizedQuestionNumber != null && segment.targetQuestionNumbers.includes(normalizedQuestionNumber)
    );

    const overlappingQuestionMatches = indexedSegments.filter(({ segment }) => (
        overlapsRange(segment) && isQuestionMatch(segment)
    ));
    const overlappingMatches = indexedSegments.filter(({ segment }) => overlapsRange(segment));
    const questionMatches = indexedSegments.filter(({ segment }) => isQuestionMatch(segment));

    const preferredMatches = overlappingQuestionMatches.length > 0
        ? overlappingQuestionMatches
        : overlappingMatches.length > 0
            ? overlappingMatches
            : questionMatches.length > 0
                ? questionMatches
                : [];

    if (preferredMatches.length === 0) {
        return null;
    }

    const startIndex = preferredMatches[0].index;
    const endIndex = preferredMatches[preferredMatches.length - 1].index;

    return normalizeInferredSnippetText(
        segments
            .slice(startIndex, endIndex + 1)
            .map((segment) => segment.text)
            .join(' '),
    ) || null;
};

export const inferCopilotReplayMatchFromText = (content?: string | null): InferredCopilotReplayMatch | null => {
    const normalizedContent = (content ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (!normalizedContent.trim()) {
        return null;
    }

    const timestampRangePattern = /[\[(]?(\d{1,2}:\d{2}(?::\d{2})?)[\])]?\s*(?:đến|den|tới|toi|[-–—]|to)\s*[\[(]?(\d{1,2}:\d{2}(?::\d{2})?)[\])]?/i;
    const timestampRangePatternGlobal = /[\[(]?(\d{1,2}:\d{2}(?::\d{2})?)[\])]?\s*(?:đến|den|tới|toi|[-–—]|to)\s*[\[(]?(\d{1,2}:\d{2}(?::\d{2})?)[\])]?/gi;
    const answerSpecificRangeMatch = normalizedContent.match(
        new RegExp(`(?:đáp án(?:\\s+đúng)?|answer|evidence|timestamp)(?:\\s+(?:nằm|nam|ở|o|at|is|appears|xuất hiện|xuat hien))?(?:\\s*[:\\-]?\\s*)${timestampRangePattern.source}`, 'i'),
    );
    if (answerSpecificRangeMatch) {
        const answerStartSecond = parseTranscriptTimeLabel(answerSpecificRangeMatch[1]);
        const answerEndSecond = parseTranscriptTimeLabel(answerSpecificRangeMatch[2] ?? null);
        if (answerStartSecond != null) {
            const questionMatch = normalizedContent.match(/(?:câu|cau|question|q)\s*(\d{1,3})/i);
            const quotedSnippetMatches = Array.from(
                normalizedContent.matchAll(/["“”]([^"“”\n]{4,220})["“”]/g),
            ).map((match) => match[1]?.trim() ?? '').filter(Boolean);

            return {
                answerStartSecond,
                answerEndSecond,
                answerTimestampLabel: formatTranscriptRangeLabel(answerStartSecond, answerEndSecond),
                questionNumber: questionMatch ? Number(questionMatch[1]) : null,
                transcriptSnippet: normalizeInferredSnippetText(quotedSnippetMatches[quotedSnippetMatches.length - 1] ?? null) || null,
            };
        }
    }

    const rangeMatches = Array.from(
        normalizedContent.matchAll(timestampRangePatternGlobal),
    ).flatMap((match) => {
        const startTime = parseTranscriptTimeLabel(match[1]);
        if (startTime == null) {
            return [];
        }

        return [{
            startTime,
            endTime: parseTranscriptTimeLabel(match[2] ?? null),
            index: match.index ?? 0,
        }];
    });

    if (rangeMatches.length === 0) {
        return null;
    }

    const questionMatch = normalizedContent.match(/(?:câu|cau|question|q)\s*(\d{1,3})/i);
    const quotedSnippetMatches = Array.from(
        normalizedContent.matchAll(/["“”]([^"“”\n]{4,220})["“”]/g),
    ).map((match) => ({
        text: match[1]?.trim() ?? '',
        index: match.index ?? 0,
    })).filter((match) => match.text);

    const selectedRange = quotedSnippetMatches.length > 0
        ? [...rangeMatches]
            .sort((left, right) => left.index - right.index)
            .reduce<typeof rangeMatches[number] | null>((best, current) => {
                const nextQuotedSnippet = quotedSnippetMatches.find((snippet) => snippet.index > current.index);
                if (!nextQuotedSnippet) {
                    return best ?? current;
                }

                const currentDistance = nextQuotedSnippet.index - current.index;
                if (!best) {
                    return current;
                }

                const bestNextSnippet = quotedSnippetMatches.find((snippet) => snippet.index > best.index);
                const bestDistance = bestNextSnippet ? bestNextSnippet.index - best.index : Number.MAX_SAFE_INTEGER;
                return currentDistance <= bestDistance ? current : best;
            }, null) ?? rangeMatches[rangeMatches.length - 1]
        : rangeMatches[rangeMatches.length - 1];

    const linkedSnippet = quotedSnippetMatches.find((snippet) => snippet.index > selectedRange.index)
        ?? quotedSnippetMatches[quotedSnippetMatches.length - 1]
        ?? null;

    return {
        answerStartSecond: selectedRange.startTime,
        answerEndSecond: selectedRange.endTime,
        answerTimestampLabel: formatTranscriptRangeLabel(selectedRange.startTime, selectedRange.endTime),
        questionNumber: questionMatch ? Number(questionMatch[1]) : null,
        transcriptSnippet: normalizeInferredSnippetText(linkedSnippet?.text) || null,
    };
};
