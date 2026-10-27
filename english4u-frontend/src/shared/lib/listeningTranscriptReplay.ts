import type { ListeningTranscriptAlignment, ListeningTranscriptSegment } from './listeningTranscriptPartSplit';
import { isListeningTranscriptInstructionText } from './listeningTranscriptPartSplit';

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

interface ListeningTranscriptSnippetLookupOptions {
    questionNumber?: number | null;
    toleranceSeconds?: number;
}

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
        const baseMatchedIndexes: number[] = [...new Set<number>(
            matchedAlignment.segmentIndexes.filter((segmentIndex: number) => segmentIndex >= 0 && segmentIndex < segments.length),
        )].sort((left: number, right: number) => left - right);
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

    const contentMatches = preferredMatches.filter(({ segment }) => (
        !isListeningTranscriptInstructionText(segment.text)
    ));
    if (contentMatches.length === 0) {
        return null;
    }

    return normalizeInferredSnippetText(
        contentMatches
            .map(({ segment }) => segment.text)
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
    const questionMatch = normalizedContent.match(/(?:câu|cau|question|q)\s*(\d{1,3})/i);
    const buildMatchResult = (
        match: RegExpMatchArray,
        transcriptSnippet?: string | null,
    ): InferredCopilotReplayMatch | null => {
        const answerStartSecond = parseTranscriptTimeLabel(match[1]);
        const answerEndSecond = parseTranscriptTimeLabel(match[2] ?? null);
        if (answerStartSecond == null) {
            return null;
        }

        return {
            answerStartSecond,
            answerEndSecond,
            answerTimestampLabel: formatTranscriptRangeLabel(answerStartSecond, answerEndSecond),
            questionNumber: questionMatch ? Number(questionMatch[1]) : null,
            transcriptSnippet: normalizeInferredSnippetText(transcriptSnippet) || null,
        };
    };

    const answerLocationRangeMatch = normalizedContent.match(
        new RegExp(
            [
                String.raw`(?:`,
                String.raw`(?:để|de)\s+(?:trả|tra)\s+(?:lời|loi)(?:\s+(?:đúng|dung))?(?:\s+(?:câu|cau|question|q)\s*\d{1,3})?`,
                String.raw`|(?:cần|can|hãy|hay)\s+(?:lắng|lang)\s+nghe`,
                String.raw`|(?:nghe|listen)(?:\s+(?:đoạn|doan|khúc|khuc|phần|phan|to))?`,
                String.raw`)[^\n]{0,180}?`,
                timestampRangePattern.source,
            ].join(''),
            'i',
        ),
    );
    if (answerLocationRangeMatch) {
        const quotedSnippetMatches = Array.from(
            normalizedContent.matchAll(/["“”]([^"“”\n]{4,220})["“”]/g),
        ).map((match) => match[1]?.trim() ?? '').filter(Boolean);
        const inferredMatch = buildMatchResult(
            answerLocationRangeMatch,
            quotedSnippetMatches[0] ?? null,
        );
        if (inferredMatch) {
            return inferredMatch;
        }
    }

    const answerSpecificRangeMatch = normalizedContent.match(
        new RegExp(`(?:đáp án(?:\\s+đúng)?|answer|evidence|timestamp)(?:\\s+(?:nằm|nam|ở|o|at|is|appears|xuất hiện|xuat hien))?(?:\\s*[:\\-]?\\s*)${timestampRangePattern.source}`, 'i'),
    );
    if (answerSpecificRangeMatch) {
        const quotedSnippetMatches = Array.from(
            normalizedContent.matchAll(/["“”]([^"“”\n]{4,220})["“”]/g),
        ).map((match) => match[1]?.trim() ?? '').filter(Boolean);
        const inferredMatch = buildMatchResult(
            answerSpecificRangeMatch,
            quotedSnippetMatches[quotedSnippetMatches.length - 1] ?? null,
        );
        if (inferredMatch) {
            return inferredMatch;
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

