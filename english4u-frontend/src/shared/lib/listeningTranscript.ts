import type {
    ListeningTranscriptAlignment,
    ListeningTranscriptSegment,
    ListeningTranscriptSerializableSegment,
} from './listeningTranscriptPartSplit';
import { normalizeTranscriptSegments } from './listeningTranscriptPartSplit';

// Re-export all submodules for complete backward compatibility
export * from './listeningTranscriptPartSplit';
export * from './listeningTranscriptReplay';

export interface ParsedListeningTranscriptData {
    schemaVersion: number | null;
    segments: ListeningTranscriptSegment[];
    alignments: ListeningTranscriptAlignment[];
    transcriptText: string | null;
    segmentCount: number;
}

export interface ListeningTranscriptSerializeInput {
    segments: ListeningTranscriptSerializableSegment[];
    alignments?: ListeningTranscriptAlignment[];
    transcriptText?: string | null;
    segmentCount?: number | null;
    schemaVersion?: number | null;
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

const dedupeQuestionNumbers = (questionNumbers: number[]) => (
    questionNumbers.filter((questionNumber, index, array) => array.indexOf(questionNumber) === index)
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

const normalizeAlignmentText = (segments: ListeningTranscriptSegment[], segmentIndexes: number[]) => (
    normalizeInferredSnippetText(
        segmentIndexes
            .filter((segmentIndex) => segmentIndex >= 0 && segmentIndex < segments.length)
            .map((segmentIndex) => segments[segmentIndex].text)
            .join(' '),
    ) || null
);

const buildQuestionNumbersBySegmentIndex = (
    alignments: ListeningTranscriptAlignment[],
    segmentCount: number,
) => {
    const questionNumbersBySegmentIndex = new Map<number, number[]>();

    alignments.forEach((alignment) => {
        alignment.segmentIndexes
            .filter((segmentIndex: number) => Number.isInteger(segmentIndex) && segmentIndex >= 0 && segmentIndex < segmentCount)
            .forEach((segmentIndex: number) => {
                questionNumbersBySegmentIndex.set(segmentIndex, dedupeQuestionNumbers([
                    ...(questionNumbersBySegmentIndex.get(segmentIndex) ?? []),
                    alignment.questionNumber,
                ]));
            });
    });

    return questionNumbersBySegmentIndex;
};

const hydrateListeningTranscriptAlignment = (
    alignment: ListeningTranscriptAlignment,
    segments: ListeningTranscriptSegment[],
): ListeningTranscriptAlignment | null => {
    if (!alignment.questionNumber || alignment.questionNumber <= 0) {
        return null;
    }

    const segmentIndexes: number[] = [...new Set<number>(
        alignment.segmentIndexes
            .map((segmentIndex: number) => Math.trunc(segmentIndex))
            .filter((segmentIndex: number) => Number.isInteger(segmentIndex) && segmentIndex >= 0 && segmentIndex < segments.length),
    )].sort((left: number, right: number) => left - right);
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
