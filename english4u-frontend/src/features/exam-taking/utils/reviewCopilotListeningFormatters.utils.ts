import { getEffectiveMcqGroupType } from '@/shared/lib/examDisplay';
import {
    findListeningReplayMatch,
    formatTranscriptRangeLabel,
    parseListeningTranscriptEnvelope,
    type ListeningTranscriptSegment,
} from '@/shared/lib/listeningTranscript';
import type {
    PracticeSessionAnswerDto,
    PracticeSessionListeningPartDto,
    PracticeSessionQuestionGroupDto,
} from '../types/session.types';
import {
    normalizeText,
    sortGroups,
    sortQuestions,
} from './reviewCopilotBase.utils';
import {
    inferListeningQuestionEvidenceMatch,
    resolveQuestionSpecificCorrectAnswer,
} from './reviewCopilotListeningEvidence.utils';
import {
    findListeningReplayScopeForQuestion,
    selectListeningReplayScopeSegments,
} from './reviewCopilotReplayScope.utils';

export type ObjectiveReviewAnswerMap = Record<string, PracticeSessionAnswerDto | undefined>;

export const formatListeningSegmentsWindowForCopilot = (segments: ListeningTranscriptSegment[]) => (
    segments
        .map((segment) => {
            const questionLabel = segment.targetQuestionNumbers.length > 0
                ? ` Q${segment.targetQuestionNumbers.join('/')}`
                : '';
            return `[${formatTranscriptRangeLabel(segment.startTime, segment.endTime)}]${questionLabel} ${segment.text}`;
        })
        .join('\n')
);

export const getListeningPartQuestionNumbers = (part: PracticeSessionListeningPartDto) => (
    sortGroups(part.questionGroups)
        .flatMap((group) => sortQuestions(group.questions))
        .flatMap((question) => question.questionNumber != null ? [question.questionNumber] : [])
);

export const findNearestListeningQuestionAnchors = ({
    segments,
    targetQuestionNumber,
    candidateQuestionNumbers,
}: {
    segments: ListeningTranscriptSegment[];
    targetQuestionNumber: number;
    candidateQuestionNumbers: number[];
}) => {
    const uniqueQuestionNumbers = Array.from(new Set(candidateQuestionNumbers)).sort((left, right) => left - right);
    const previousQuestionNumber = [...uniqueQuestionNumbers]
        .reverse()
        .find((questionNumber) => questionNumber < targetQuestionNumber);
    const nextQuestionNumber = uniqueQuestionNumbers
        .find((questionNumber) => questionNumber > targetQuestionNumber);

    const previousIndexes = previousQuestionNumber == null
        ? []
        : segments.flatMap((segment, index) => (
            segment.targetQuestionNumbers.includes(previousQuestionNumber) ? [index] : []
        ));
    const nextIndexes = nextQuestionNumber == null
        ? []
        : segments.flatMap((segment, index) => (
            segment.targetQuestionNumbers.includes(nextQuestionNumber) ? [index] : []
        ));

    return {
        previousQuestionNumber: previousQuestionNumber ?? null,
        nextQuestionNumber: nextQuestionNumber ?? null,
        previousAnchorIndex: previousIndexes.length > 0 ? previousIndexes[previousIndexes.length - 1] : null,
        nextAnchorIndex: nextIndexes.length > 0 ? nextIndexes[0] : null,
    };
};

export const buildListeningAnchorFallbackWindow = ({
    segments,
    questionNumber,
    candidateQuestionNumbers,
}: {
    segments: ListeningTranscriptSegment[];
    questionNumber: number;
    candidateQuestionNumbers: number[];
}) => {
    const {
        previousQuestionNumber,
        nextQuestionNumber,
        previousAnchorIndex,
        nextAnchorIndex,
    } = findNearestListeningQuestionAnchors({
        segments,
        targetQuestionNumber: questionNumber,
        candidateQuestionNumbers,
    });

    if (previousAnchorIndex == null && nextAnchorIndex == null) {
        return null;
    }

    const startIndex = previousAnchorIndex != null
        ? previousAnchorIndex
        : Math.max(0, (nextAnchorIndex ?? 0) - 8);
    const endIndex = nextAnchorIndex != null
        ? nextAnchorIndex
        : Math.min(segments.length - 1, (previousAnchorIndex ?? 0) + 8);

    if (startIndex > endIndex) {
        return null;
    }

    const windowSegments = segments.slice(startIndex, endIndex + 1);
    if (windowSegments.length === 0) {
        return null;
    }

    const boundaryLabel = previousQuestionNumber != null && nextQuestionNumber != null
        ? `Q${previousQuestionNumber} và Q${nextQuestionNumber}`
        : previousQuestionNumber != null
            ? `sau Q${previousQuestionNumber}`
            : nextQuestionNumber != null
                ? `trước Q${nextQuestionNumber}`
                : 'cùng part';

    return [
        `Đây là đoạn transcript kẹp ${boundaryLabel} trong cùng part để AI bám đúng ngữ cảnh cho câu ${questionNumber}.`,
        formatListeningSegmentsWindowForCopilot(windowSegments),
    ].join('\n');
};

export const getNormalizedListeningGroupType = (group?: PracticeSessionQuestionGroupDto | null) => {
    if (!group) {
        return '';
    }

    const effectiveGroupType = getEffectiveMcqGroupType({
        groupType: group.groupType,
        contentData: group.contentData,
        questionCount: group.questions.length,
        hasQuestionContent: group.questions.some((question) => !!question.content?.trim()),
    });

    return (effectiveGroupType || group.groupType || '').trim().toUpperCase();
};

export const getListeningTranscriptWindowConfig = ({
    group,
    questionNumber,
}: {
    group?: PracticeSessionQuestionGroupDto | null;
    questionNumber?: number | null;
}) => {
    const normalizedQuestionNumber = questionNumber ?? null;
    if (!group) {
        return {
            targetQuestionNumbers: normalizedQuestionNumber != null ? [normalizedQuestionNumber] : [],
            surroundingSegments: 3,
            scopeLabel: normalizedQuestionNumber != null ? `câu ${normalizedQuestionNumber}` : 'đoạn này',
        };
    }

    const questionNumbers = sortQuestions(group.questions)
        .flatMap((question) => question.questionNumber != null ? [question.questionNumber] : []);
    const normalizedGroupType = getNormalizedListeningGroupType(group);

    if ((normalizedGroupType === 'MCQ_CHOOSE_N' || normalizedGroupType === 'MCQ_MULTIPLE') && questionNumbers.length > 0) {
        return {
            targetQuestionNumbers: questionNumbers,
            surroundingSegments: 10,
            scopeLabel: `nhóm câu ${questionNumbers.join(', ')}`,
        };
    }

    if (normalizedGroupType === 'MCQ_SINGLE') {
        return {
            targetQuestionNumbers: normalizedQuestionNumber != null ? [normalizedQuestionNumber] : [],
            surroundingSegments: 6,
            scopeLabel: normalizedQuestionNumber != null ? `câu ${normalizedQuestionNumber}` : 'câu đang hỏi',
        };
    }

    if (normalizedGroupType === 'MAP_LABELLING') {
        const effectiveQuestionNumbers = questionNumbers.length > 0
            ? questionNumbers
            : normalizedQuestionNumber != null
                ? [normalizedQuestionNumber]
                : [];

        return {
            targetQuestionNumbers: effectiveQuestionNumbers,
            surroundingSegments: 10,
            scopeLabel: effectiveQuestionNumbers.length > 0
                ? `nhóm câu ${effectiveQuestionNumbers.join(', ')}`
                : (normalizedQuestionNumber != null ? `câu ${normalizedQuestionNumber}` : 'câu đang hỏi'),
        };
    }

    if (normalizedGroupType.startsWith('MATCHING')) {
        return {
            targetQuestionNumbers: normalizedQuestionNumber != null ? [normalizedQuestionNumber] : [],
            surroundingSegments: 6,
            scopeLabel: normalizedQuestionNumber != null ? `câu ${normalizedQuestionNumber}` : 'câu đang hỏi',
        };
    }

    return {
        targetQuestionNumbers: normalizedQuestionNumber != null ? [normalizedQuestionNumber] : [],
        surroundingSegments: 3,
        scopeLabel: normalizedQuestionNumber != null ? `câu ${normalizedQuestionNumber}` : 'câu đang hỏi',
    };
};

export const buildListeningTranscriptWindowText = (
    part: PracticeSessionListeningPartDto,
    options?: {
        questionNumber?: number | null;
        group?: PracticeSessionQuestionGroupDto | null;
        reviewAnswer?: PracticeSessionAnswerDto | null;
    },
) => {
    const transcriptData = parseListeningTranscriptEnvelope(part.transcriptData);
    const transcriptSegments = transcriptData.segments;
    if (transcriptSegments.length === 0) {
        return '';
    }

    if ((options?.questionNumber ?? null) == null) {
        return formatListeningSegmentsWindowForCopilot(transcriptSegments.slice(0, 24));
    }

    const partQuestionNumbers = getListeningPartQuestionNumbers(part);
    const groupQuestionNumbers = options?.group
        ? sortQuestions(options.group.questions)
            .flatMap((question) => question.questionNumber != null ? [question.questionNumber] : [])
        : [];

    const {
        targetQuestionNumbers,
        surroundingSegments,
        scopeLabel,
    } = getListeningTranscriptWindowConfig({
        group: options?.group,
        questionNumber: options?.questionNumber,
    });
    const normalizedGroupType = getNormalizedListeningGroupType(options?.group);
    const shouldPreferScopeFallback = normalizedGroupType.startsWith('MATCHING');
    const fallbackScopeWindowLimit = shouldPreferScopeFallback ? 96 : 80;
    const focusedQuestion = options?.group && options?.questionNumber != null
        ? sortQuestions(options.group.questions).find((question) => question.questionNumber === options.questionNumber) ?? null
        : null;
    const focusedQuestionForEvidence = focusedQuestion
        ? {
            ...focusedQuestion,
            correctAnswer: options?.group
                ? resolveQuestionSpecificCorrectAnswer(options.group, focusedQuestion, options?.reviewAnswer || undefined) || focusedQuestion.correctAnswer
                : normalizeText(options?.reviewAnswer?.correctAnswer) || focusedQuestion.correctAnswer,
        }
        : null;

    const matchedIndexes = transcriptSegments.flatMap((segment, index) => (
        segment.targetQuestionNumbers.some((candidateQuestionNumber) => targetQuestionNumbers.includes(candidateQuestionNumber))
            ? [index]
            : []
    ));

    const inferredEvidenceMatch = options?.group && focusedQuestion
        ? inferListeningQuestionEvidenceMatch({
            segments: transcriptSegments,
            group: options.group,
            question: focusedQuestionForEvidence ?? focusedQuestion,
        })
        : null;
    const shouldPreferInferredEvidence = Boolean(
        inferredEvidenceMatch
        && inferredEvidenceMatch.segmentIndexes.length > 0,
    );

    if (shouldPreferInferredEvidence && inferredEvidenceMatch) {
        const startIndex = Math.max(0, inferredEvidenceMatch.segmentIndexes[0] - surroundingSegments);
        const endIndex = Math.min(
            transcriptSegments.length - 1,
            inferredEvidenceMatch.segmentIndexes[inferredEvidenceMatch.segmentIndexes.length - 1] + surroundingSegments,
        );

        return [
            `Đoạn bằng chứng chính cho câu ${options?.questionNumber}: ${formatTranscriptRangeLabel(
                inferredEvidenceMatch.startTime,
                inferredEvidenceMatch.endTime,
            )}`,
            targetQuestionNumbers.length > 1
                ? `Window transcript đang mở rộng theo ${scopeLabel} để không bỏ sót đáp án rải rác trong cùng một đoạn nghe.`
                : '',
            formatListeningSegmentsWindowForCopilot(transcriptSegments.slice(startIndex, endIndex + 1)),
        ].filter(Boolean).join('\n');
    }

    if (matchedIndexes.length === 0) {
        if (inferredEvidenceMatch && inferredEvidenceMatch.segmentIndexes.length > 0) {
            const startIndex = Math.max(0, inferredEvidenceMatch.segmentIndexes[0] - surroundingSegments);
            const endIndex = Math.min(
                transcriptSegments.length - 1,
                inferredEvidenceMatch.segmentIndexes[inferredEvidenceMatch.segmentIndexes.length - 1] + surroundingSegments,
            );

            return [
                `Đoạn bằng chứng chính cho câu ${options?.questionNumber}: ${formatTranscriptRangeLabel(
                    inferredEvidenceMatch.startTime,
                    inferredEvidenceMatch.endTime,
                )}`,
                targetQuestionNumbers.length > 1
                    ? `Window transcript đang mở rộng theo ${scopeLabel} để không bỏ sót đáp án rải rác trong cùng một đoạn nghe.`
                    : '',
                formatListeningSegmentsWindowForCopilot(transcriptSegments.slice(startIndex, endIndex + 1)),
            ].filter(Boolean).join('\n');
        }

        const fallbackScope = findListeningReplayScopeForQuestion(transcriptSegments, options?.questionNumber);
        if (shouldPreferScopeFallback && fallbackScope) {
            const fallbackWindowSegments = selectListeningReplayScopeSegments({
                segments: transcriptSegments,
                scope: fallbackScope,
                questionNumber: options?.questionNumber ?? 0,
                maxSegments: fallbackScopeWindowLimit,
            });
            if (fallbackWindowSegments.length > 0) {
                return [
                    options?.questionNumber != null
                        ? `Đây là transcript scope của nhóm câu ${fallbackScope.startQuestion}-${fallbackScope.endQuestion} trong đúng part để AI bám đúng đoạn nghe cho câu ${options.questionNumber}.`
                        : '',
                    formatListeningSegmentsWindowForCopilot(fallbackWindowSegments),
                ].filter(Boolean).join('\n');
            }
        }

        const anchorFallbackWindow = options?.questionNumber != null
            ? buildListeningAnchorFallbackWindow({
                segments: transcriptSegments,
                questionNumber: options.questionNumber,
                candidateQuestionNumbers: groupQuestionNumbers.length > 0 ? groupQuestionNumbers : partQuestionNumbers,
            })
            : null;
        if (anchorFallbackWindow) {
            return anchorFallbackWindow;
        }

        if (!fallbackScope) {
            return [
                options?.questionNumber != null
                    ? `Đây là transcript của đúng part hiện tại để AI tự tìm bằng chứng cho câu ${options.questionNumber}; không được chỉ dựa vào đầu part nếu câu nằm ở đoạn sau.`
                    : '',
                formatListeningSegmentsWindowForCopilot(transcriptSegments.slice(0, 120)),
            ].filter(Boolean).join('\n');
        }

        const fallbackWindowSegments = selectListeningReplayScopeSegments({
            segments: transcriptSegments,
            scope: fallbackScope,
            questionNumber: options?.questionNumber ?? 0,
            maxSegments: fallbackScopeWindowLimit,
        });
        if (fallbackWindowSegments.length === 0) {
            return '';
        }

        return [
            options?.questionNumber != null
                ? `Đây là transcript scope của nhóm câu ${fallbackScope.startQuestion}-${fallbackScope.endQuestion} trong đúng part để AI bám đúng đoạn nghe cho câu ${options.questionNumber}.`
                : '',
            formatListeningSegmentsWindowForCopilot(fallbackWindowSegments),
        ].filter(Boolean).join('\n');
    }

    const startIndex = Math.max(0, matchedIndexes[0] - surroundingSegments);
    const endIndex = Math.min(transcriptSegments.length - 1, matchedIndexes[matchedIndexes.length - 1] + surroundingSegments);
    const primaryReplayMatch = options?.questionNumber != null
        ? findListeningReplayMatch(transcriptSegments, options.questionNumber, transcriptData.alignments)
        : null;
    const transcriptWindow = formatListeningSegmentsWindowForCopilot(
        transcriptSegments.slice(startIndex, endIndex + 1),
    );

    return [
        primaryReplayMatch
            ? `Đoạn bằng chứng chính cho câu ${options?.questionNumber}: ${formatTranscriptRangeLabel(primaryReplayMatch.startTime, primaryReplayMatch.endTime)}`
            : '',
        targetQuestionNumbers.length > 1
            ? `Window transcript đang mở rộng theo ${scopeLabel} để không bỏ sót đáp án rải rác trong cùng một đoạn nghe.`
            : '',
        transcriptWindow,
    ].filter(Boolean).join('\n');
};

export const buildListeningPartBlock = ({
    part,
    answerMap,
    reviewAnswerMap,
    buildGroupBlock,
    includeTranscript = false,
}: {
    part: PracticeSessionListeningPartDto;
    answerMap: Record<string, string>;
    reviewAnswerMap: ObjectiveReviewAnswerMap;
    buildGroupBlock: (params: {
        group: PracticeSessionQuestionGroupDto;
        answerMap: Record<string, string>;
        reviewAnswerMap: ObjectiveReviewAnswerMap;
    }) => string;
    includeTranscript?: boolean;
}) => {
    const heading = `Part ${part.partNumber ?? 'N/A'}`;

    return [
        heading,
        part.contextDescription
            ? `Nội dung hiển thị cho học viên:\n${normalizeText(part.contextDescription)}`
            : 'Không có nội dung hiển thị của part.',
        includeTranscript
            ? (() => {
                const transcriptLines = buildListeningTranscriptWindowText(part);
                return transcriptLines
                    ? `Tapescript có timestamp cho AI:\n${transcriptLines}`
                    : 'Không có tapescript timestamp.';
            })()
            : '',
        part.audioUrl ? `Audio URL: ${part.audioUrl}` : '',
        ...sortGroups(part.questionGroups).map((group) => buildGroupBlock({ group, answerMap, reviewAnswerMap })),
    ].filter(Boolean).join('\n\n');
};
