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

export interface ListeningTranscriptSerializableSegment {
    startTime: number;
    endTime: number | null;
    text: string;
    isTargetForQuestion?: number | number[] | null;
    targetQuestionNumbers?: number[] | null;
    questionNumbers?: number[] | null;
    questionNumber?: number | null;
}

export interface ListeningTranscriptPartSplitResult {
    segmentsByPart: ListeningTranscriptSegment[][];
    detectedBoundaryCount: number;
    usedDetectedBoundaries: boolean;
}

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

export const isListeningTranscriptInstructionText = (text?: string | null) => {
    const normalized = text ? normalizeListeningMarkerText(text) : '';
    if (!normalized) {
        return false;
    }

    return /\bbefore you hear\b.*\bquestions?\b/.test(normalized)
        || /\bfirst you have some time to look at questions?\b/.test(normalized)
        || /\bnow listen(?: carefully)? and answer questions?\b/.test(normalized)
        || /\byou now have\b.*\bto check your answers\b/.test(normalized)
        || /\bnow turn to (?:section|part)\b/.test(normalized)
        || /\bthat is the end of (?:section|part)\b/.test(normalized);
};

const parseSplitTurnBoundaryMarker = (
    currentText: string,
    nextText: string | undefined,
    partCount: number,
): Pick<ListeningTranscriptPartBoundaryMarker, 'partNumber' | 'priority'> | null => {
    const current = normalizeListeningMarkerText(currentText);
    const nextTokens = normalizeListeningMarkerText(nextText ?? '').split(/\s+/).filter(Boolean);
    if (!current || nextTokens.length === 0) {
        return null;
    }

    let partToken: string | undefined;
    if (/\bturn to (?:section|part)$/.test(current)) {
        partToken = nextTokens[0];
    } else if (/\bturn to$/.test(current) && (nextTokens[0] === 'section' || nextTokens[0] === 'part')) {
        partToken = nextTokens[1];
    }

    const partNumber = partToken ? listeningPartNumberWords[partToken] : null;
    if (partNumber == null || partNumber < 1 || partNumber > partCount) {
        return null;
    }

    return {
        partNumber,
        priority: 4,
    };
};

const trimTrailingSplitTurnMarker = (text: string) => (
    text
        .replace(/\s*(?:now\s+)?turn\s+to(?:\s+(?:section|part))?\s*$/i, '')
        .trim()
);

const trimLeadingSplitTurnMarkerPart = (text: string, partNumber: number) => {
    const numberTokens = Object.entries(listeningPartNumberWords)
        .filter(([, value]) => value === partNumber)
        .map(([token]) => token)
        .join('|');

    if (!numberTokens) {
        return text.trim();
    }

    return text
        .replace(new RegExp(`^\\s*(?:(?:section|part)\\s+)?(?:${numberTokens})\\b\\s*[.:-]?\\s*`, 'i'), '')
        .trim();
};

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

const dedupeQuestionNumbers = (questionNumbers: number[]) => (
    questionNumbers.filter((questionNumber, index, array) => array.indexOf(questionNumber) === index)
);

const normalizeSegmentQuestionNumbers = (rawSegment: Record<string, unknown>) => dedupeQuestionNumbers([
    ...toQuestionNumbers(rawSegment.isTargetForQuestion),
    ...toQuestionNumbers(rawSegment.targetQuestionNumbers),
    ...toQuestionNumbers(rawSegment.questionNumbers),
    ...toQuestionNumbers(rawSegment.questionNumber),
]);

export const normalizeTranscriptSegments = (value: unknown): ListeningTranscriptSegment[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.flatMap((item) => {
        if (!item || typeof item !== 'object') {
            return [];
        }

        const rawSegment = item as Record<string, unknown>;
        const startTime = toFiniteNumber(rawSegment.startTime ?? rawSegment.start_time ?? rawSegment.start);
        const endTime = toFiniteNumber(rawSegment.endTime ?? rawSegment.end_time ?? rawSegment.end);
        const text = typeof rawSegment.text === 'string'
            ? rawSegment.text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
            : '';

        if (startTime == null || !text) {
            return [];
        }

        return [{
            startTime,
            endTime: endTime != null && endTime >= startTime ? endTime : null,
            text,
            targetQuestionNumbers: normalizeSegmentQuestionNumbers(rawSegment),
        }];
    });
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

    const boundaryIndexByPart = new Map<number, {
        index: number;
        previousEndIndex: number;
        priority: number;
        splitAcrossSegments?: boolean;
    }>();
    const registerBoundary = (
        partNumber: number,
        boundary: {
            index: number;
            previousEndIndex: number;
            priority: number;
            splitAcrossSegments?: boolean;
        },
    ) => {
        const existing = boundaryIndexByPart.get(partNumber);
        if (
            !existing
            || boundary.index < existing.index
            || (boundary.index === existing.index && boundary.priority > existing.priority)
        ) {
            boundaryIndexByPart.set(partNumber, boundary);
        }
    };

    normalizedSegments.forEach((segment, index) => {
        const marker = parseListeningTranscriptPartBoundaryMarker(segment.text, effectivePartCount);
        if (marker && marker.partNumber >= 1 && marker.partNumber <= effectivePartCount) {
            const boundaryIndex = index + marker.boundaryOffset;
            if (boundaryIndex >= 0 && boundaryIndex < normalizedSegments.length) {
                registerBoundary(marker.partNumber, {
                    index: boundaryIndex,
                    previousEndIndex: index,
                    priority: marker.priority,
                });
            }
        }

        const splitMarker = parseSplitTurnBoundaryMarker(
            segment.text,
            normalizedSegments[index + 1]?.text,
            effectivePartCount,
        );
        if (splitMarker && index + 1 < normalizedSegments.length) {
            registerBoundary(splitMarker.partNumber, {
                index: index + 1,
                previousEndIndex: index + 1,
                priority: splitMarker.priority,
                splitAcrossSegments: true,
            });
        }
    });

    if (!boundaryIndexByPart.has(1)) {
        boundaryIndexByPart.set(1, { index: 0, previousEndIndex: 0, priority: 0 });
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
        const nextBoundaryInfo = nextBoundary ? boundaryIndexByPart.get(nextBoundary[0]) : null;
        const endIndexExclusive = nextBoundaryInfo ? nextBoundaryInfo.previousEndIndex : normalizedSegments.length;
        const partSegments = normalizedSegments.slice(startIndex, Math.max(startIndex + 1, endIndexExclusive));
        const boundaryInfo = boundaryIndexByPart.get(partNumber);
        const cleanedSegments = partSegments
            .map((segment, offset) => {
                const globalIndex = startIndex + offset;
                let text = segment.text;

                if (boundaryInfo?.splitAcrossSegments && globalIndex === boundaryInfo.index) {
                    text = trimLeadingSplitTurnMarkerPart(text, partNumber);
                }

                if (nextBoundaryInfo?.splitAcrossSegments && globalIndex === nextBoundaryInfo.previousEndIndex - 1) {
                    text = trimTrailingSplitTurnMarker(text);
                }

                return { ...segment, text };
            })
            .filter((segment) => segment.text.trim());

        return cleanedSegments.length > 0 ? cleanedSegments : normalizedSegments;
    });

    return {
        segmentsByPart,
        detectedBoundaryCount: sortedBoundaries.length,
        usedDetectedBoundaries,
    };
};

