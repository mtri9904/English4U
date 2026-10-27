import type { CopilotReplayAction } from '../types/copilot.types';
import type {
    PracticeSessionAnswerDto,
    PracticeSessionListeningPartDto,
    PracticeSessionQuestionDto,
    PracticeSessionQuestionGroupDto,
} from '../types/session.types';
import {
    findListeningReplayMatch,
    findListeningTranscriptSnippetByTime,
    formatTranscriptRangeLabel,
    parseListeningTranscriptEnvelope,
} from '@/shared/lib/listeningTranscript';
import {
    inferListeningQuestionEvidenceMatch,
    resolveQuestionSpecificCorrectAnswer,
} from './reviewCopilotContext.utils';
import {
    extractRequestedReplayQuestionNumber,
    hasListeningReplayIntent,
    parseQuestionRangeFromListeningTranscriptSegment,
} from './reviewCopilotSelectionIntent.utils';

export const LISTENING_REPLAY_PREROLL_SECONDS = 10;
export const LISTENING_REPLAY_POSTROLL_SECONDS = 5;

const sortObjectiveQuestions = (questions: PracticeSessionQuestionDto[]) => (
    [...questions].sort((left, right) => {
        const leftOrder = left.questionNumber ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = right.questionNumber ?? Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder || left.id.localeCompare(right.id);
    })
);

const sortObjectiveGroups = (groups: PracticeSessionQuestionGroupDto[]) => (
    [...groups].sort((left, right) => {
        const leftOrder = left.startQuestion ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = right.startQuestion ?? Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder || left.id.localeCompare(right.id);
    })
);

export const detectListeningReplayScopes = (segments: Array<{ text: string }>) => {
    const maxSegmentIndex = Math.max(segments.length - 1, 0);
    const events: Array<{
        firstSegmentIndex: number;
        lastSegmentIndex: number;
        startQuestion: number;
        endQuestion: number;
    }> = [];

    segments.forEach((segment, index) => {
        let eventSegmentIndex = index;
        let questionRange = parseQuestionRangeFromListeningTranscriptSegment(segment.text);
        if (!questionRange && segments[index + 1]) {
            questionRange = parseQuestionRangeFromListeningTranscriptSegment(
                `${segment.text ?? ''} ${segments[index + 1].text ?? ''}`,
            );
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

export const findListeningReplayScopeForQuestion = (
    segments: Array<{ text: string }>,
    questionNumber?: number | null,
) => {
    if (questionNumber == null || segments.length === 0) {
        return null;
    }

    return detectListeningReplayScopes(segments)
        .find((scope) => scope.startQuestion <= questionNumber && questionNumber <= scope.endQuestion) ?? null;
};

export const getListeningReplayScopeBounds = (
    segments: Array<{ text: string; startTime: number; endTime?: number | null }>,
    questionNumber?: number | null,
) => {
    const scope = findListeningReplayScopeForQuestion(segments, questionNumber);
    if (!scope || scope.endSegmentIndex < scope.startSegmentIndex) {
        return null;
    }

    const firstSegment = segments[scope.startSegmentIndex];
    const lastSegment = segments[scope.endSegmentIndex];
    if (!firstSegment || !lastSegment) {
        return null;
    }

    return {
        startSecond: firstSegment.startTime,
        endSecond: lastSegment.endTime ?? lastSegment.startTime,
    };
};

export const selectListeningReplayScopeSegments = <T,>({
    segments,
    scope,
    questionNumber,
    maxSegments,
}: {
    segments: T[];
    scope: NonNullable<ReturnType<typeof findListeningReplayScopeForQuestion>>;
    questionNumber: number;
    maxSegments: number;
}) => {
    if (scope.endSegmentIndex < scope.startSegmentIndex) {
        return [];
    }

    const scopeSegments = segments.slice(scope.startSegmentIndex, scope.endSegmentIndex + 1);
    if (scopeSegments.length <= maxSegments) {
        return scopeSegments;
    }

    const questionSpan = Math.max(1, scope.endQuestion - scope.startQuestion);
    const questionRatio = Math.max(0, Math.min(1, (questionNumber - scope.startQuestion) / questionSpan));
    const centerIndex = Math.round(questionRatio * (scopeSegments.length - 1));
    const halfWindow = Math.floor(maxSegments / 2);
    const startIndex = Math.min(
        Math.max(0, centerIndex - halfWindow),
        Math.max(0, scopeSegments.length - maxSegments),
    );

    return scopeSegments.slice(startIndex, startIndex + maxSegments);
};

export const buildListeningScopeReplayMatch = (
    segments: ReturnType<typeof parseListeningTranscriptEnvelope>['segments'],
    questionNumber: number,
) => {
    const scope = findListeningReplayScopeForQuestion(segments, questionNumber);
    if (!scope) {
        return null;
    }

    const scopeSegments = selectListeningReplayScopeSegments({
        segments,
        scope,
        questionNumber,
        maxSegments: 8,
    });
    if (scopeSegments.length === 0) {
        return null;
    }

    const firstSegment = scopeSegments[0];
    const lastSegment = scopeSegments[scopeSegments.length - 1];

    return {
        startTime: firstSegment.startTime,
        endTime: lastSegment.endTime ?? lastSegment.startTime,
        text: scopeSegments.map((segment) => segment.text).join(' ').trim(),
    };
};

export const isReplayMatchInsideQuestionScope = (
    segments: ReturnType<typeof parseListeningTranscriptEnvelope>['segments'],
    questionNumber: number,
    replayMatch: { startTime: number; endTime?: number | null } | null,
) => {
    if (!replayMatch) {
        return false;
    }

    const scope = findListeningReplayScopeForQuestion(segments, questionNumber);
    if (!scope) {
        return true;
    }

    const firstSegment = segments[scope.startSegmentIndex];
    const lastSegment = segments[scope.endSegmentIndex];
    if (!firstSegment || !lastSegment || scope.endSegmentIndex < scope.startSegmentIndex) {
        return true;
    }

    const scopeStartTime = firstSegment.startTime;
    const scopeEndTime = lastSegment.endTime ?? lastSegment.startTime;
    return replayMatch.startTime >= scopeStartTime - 1.5
        && replayMatch.startTime <= scopeEndTime + 1.5;
};

export const createListeningReplayAction = ({
    audioUrl,
    answerStartSecond,
    answerEndSecond,
    replayStartLimitSecond,
    replayEndLimitSecond,
    transcriptSnippet,
    questionNumber,
    matchType = 'exact',
}: {
    audioUrl: string;
    answerStartSecond: number;
    answerEndSecond?: number | null;
    replayStartLimitSecond?: number | null;
    replayEndLimitSecond?: number | null;
    transcriptSnippet?: string | null;
    questionNumber?: number | null;
    matchType?: 'exact' | 'scope';
}): CopilotReplayAction => {
    const playAtSecond = Math.max(
        replayStartLimitSecond ?? 0,
        answerStartSecond - LISTENING_REPLAY_PREROLL_SECONDS,
    );
    const unclippedReplayEndSecond = answerEndSecond != null
        ? answerEndSecond + LISTENING_REPLAY_POSTROLL_SECONDS
        : null;
    const replayEndSecond = unclippedReplayEndSecond != null && replayEndLimitSecond != null
        ? Math.min(unclippedReplayEndSecond, replayEndLimitSecond)
        : unclippedReplayEndSecond;
    const answerTimestampLabel = formatTranscriptRangeLabel(answerStartSecond, answerEndSecond);
    const timestampLabel = formatTranscriptRangeLabel(playAtSecond, replayEndSecond);

    return {
        audioUrl,
        playAtSecond,
        endAtSecond: replayEndSecond,
        timestampLabel,
        answerTimestampLabel: playAtSecond < answerStartSecond ? answerTimestampLabel : null,
        transcriptSnippet,
        questionNumber: questionNumber ?? null,
        matchType,
    };
};

export const buildListeningReplayActionForQuestion = ({
    parts,
    activePartIndex,
    questionNumber,
    reviewAnswerMap,
}: {
    parts: PracticeSessionListeningPartDto[];
    activePartIndex: number;
    questionNumber: number;
    reviewAnswerMap?: Record<string, PracticeSessionAnswerDto | undefined>;
}): CopilotReplayAction | null => {
    const orderedParts = parts
        .map((part, index) => ({ part, index }))
        .sort((left, right) => {
            if (left.index === activePartIndex) {
                return -1;
            }

            if (right.index === activePartIndex) {
                return 1;
            }

            return left.index - right.index;
        });

    for (const { part } of orderedParts) {
        const transcriptData = parseListeningTranscriptEnvelope(part.transcriptData);
        const transcriptSegments = transcriptData.segments;
        if (transcriptSegments.length === 0) {
            continue;
        }

        const locatedGroup = sortObjectiveGroups(part.questionGroups).find((group) => (
            sortObjectiveQuestions(group.questions).some((question) => question.questionNumber === questionNumber)
        )) ?? null;
        const locatedQuestion = locatedGroup
            ? sortObjectiveQuestions(locatedGroup.questions).find((question) => question.questionNumber === questionNumber) ?? null
            : null;

        const replayMatch = findListeningReplayMatch(
            transcriptSegments,
            questionNumber,
            transcriptData.alignments,
        );
        const locatedQuestionReviewAnswer = locatedQuestion ? reviewAnswerMap?.[locatedQuestion.id] : undefined;
        const inferredReplayMatch = locatedGroup && locatedQuestion
            ? inferListeningQuestionEvidenceMatch({
                segments: transcriptSegments,
                group: locatedGroup,
                question: {
                    ...locatedQuestion,
                    correctAnswer: resolveQuestionSpecificCorrectAnswer(
                        locatedGroup,
                        locatedQuestion,
                        locatedQuestionReviewAnswer,
                    ) || locatedQuestion.correctAnswer,
                },
            })
            : null;

        const audioUrl = (part.audioUrl ?? '').trim();
        if (!audioUrl) {
            continue;
        }

        const replayMatchInsideQuestionScope = isReplayMatchInsideQuestionScope(
            transcriptSegments,
            questionNumber,
            replayMatch,
        );
        const replayScopeBounds = getListeningReplayScopeBounds(transcriptSegments, questionNumber);
        const preferredReplayMatch = inferredReplayMatch
            ?? (replayMatchInsideQuestionScope ? replayMatch : null);

        if (preferredReplayMatch) {
            return createListeningReplayAction({
                audioUrl,
                answerStartSecond: preferredReplayMatch.startTime,
                answerEndSecond: preferredReplayMatch.endTime,
                replayStartLimitSecond: replayScopeBounds?.startSecond,
                replayEndLimitSecond: replayScopeBounds?.endSecond,
                transcriptSnippet: preferredReplayMatch.text,
                questionNumber,
                matchType: 'exact',
            });
        }

        const scopeReplayMatch = buildListeningScopeReplayMatch(transcriptSegments, questionNumber);
        if (scopeReplayMatch) {
            return createListeningReplayAction({
                audioUrl,
                answerStartSecond: scopeReplayMatch.startTime,
                answerEndSecond: scopeReplayMatch.endTime,
                replayStartLimitSecond: replayScopeBounds?.startSecond,
                replayEndLimitSecond: replayScopeBounds?.endSecond,
                transcriptSnippet: scopeReplayMatch.text,
                questionNumber,
                matchType: 'scope',
            });
        }
    }

    return null;
};

export const buildListeningReplayLookup = ({
    parts,
    activePartIndex,
    message,
    focusedQuestionNumber,
    reviewAnswerMap,
}: {
    parts: PracticeSessionListeningPartDto[];
    activePartIndex: number;
    message: string;
    focusedQuestionNumber?: number | null;
    reviewAnswerMap?: Record<string, PracticeSessionAnswerDto | undefined>;
}): CopilotReplayAction | null => {
    if (!hasListeningReplayIntent(message)) {
        return null;
    }

    const questionNumber = extractRequestedReplayQuestionNumber(message, focusedQuestionNumber);
    if (questionNumber == null) {
        return null;
    }

    return buildListeningReplayActionForQuestion({
        parts,
        activePartIndex,
        questionNumber,
        reviewAnswerMap,
    });
};

export const resolveListeningTranscriptSnippetForReplay = ({
    parts,
    activePartIndex,
    answerStartSecond,
    answerEndSecond,
    questionNumber,
}: {
    parts: PracticeSessionListeningPartDto[];
    activePartIndex: number;
    answerStartSecond: number;
    answerEndSecond?: number | null;
    questionNumber?: number | null;
}) => {
    const orderedParts = parts
        .map((part, index) => ({ part, index }))
        .sort((left, right) => {
            if (left.index === activePartIndex) {
                return -1;
            }

            if (right.index === activePartIndex) {
                return 1;
            }

            return left.index - right.index;
        });

    for (const { part } of orderedParts) {
        const transcriptData = parseListeningTranscriptEnvelope(part.transcriptData);
        const transcriptSegments = transcriptData.segments;
        if (transcriptSegments.length === 0) {
            continue;
        }

        const snippet = findListeningTranscriptSnippetByTime(
            transcriptSegments,
            answerStartSecond,
            answerEndSecond,
            { questionNumber },
        );
        if (snippet) {
            return snippet;
        }
    }

    return null;
};

export const resolveListeningReplayScopeBounds = ({
    parts,
    activePartIndex,
    questionNumber,
}: {
    parts: PracticeSessionListeningPartDto[];
    activePartIndex: number;
    questionNumber?: number | null;
}) => {
    if (questionNumber == null) {
        return null;
    }

    const orderedParts = parts
        .map((part, index) => ({ part, index }))
        .sort((left, right) => {
            if (left.index === activePartIndex) {
                return -1;
            }

            if (right.index === activePartIndex) {
                return 1;
            }

            return left.index - right.index;
        });

    for (const { part } of orderedParts) {
        const transcriptData = parseListeningTranscriptEnvelope(part.transcriptData);
        const scopeBounds = getListeningReplayScopeBounds(transcriptData.segments, questionNumber);
        if (scopeBounds) {
            return scopeBounds;
        }
    }

    return null;
};

