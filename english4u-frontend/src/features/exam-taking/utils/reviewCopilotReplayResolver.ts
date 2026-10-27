import { inferCopilotReplayMatchFromText } from '@/shared/lib/listeningTranscript';
import type { CopilotFocusPayload, CopilotReplayAction, ReviewCopilotContext } from '../types/copilot.types';
import type {
    PracticeSessionAnswerDto,
    PracticeSessionListeningPartDto,
    PracticeSessionReadingPassageDto,
} from '../types/session.types';
import {
    findListeningQuestionFocusPayload,
    findReadingQuestionFocusPayload,
} from './reviewCopilotContext.utils';
import {
    buildListeningReplayActionForQuestion,
    createListeningReplayAction,
    extractReferencedQuestionNumber,
    extractReferencedQuestionNumbers,
    inferListeningQuestionNumberFromContextText,
    isCorrectAnswerQuery,
    mergeCopilotImages,
    resolveListeningReplayScopeBounds,
    resolveListeningTranscriptSnippetForReplay,
} from './reviewCopilot.utils';

interface ResolveEffectiveContextArgs {
    skillType: string;
    userMessage: string;
    copilotContext: ReviewCopilotContext;
    copilotSelectedText: string;
    listeningParts: PracticeSessionListeningPartDto[];
    readingPassages: PracticeSessionReadingPassageDto[];
    answerMap: Record<string, string>;
    reviewAnswerMap: Record<string, PracticeSessionAnswerDto>;
}

export const resolveEffectiveContextForMessage = ({
    skillType,
    userMessage,
    copilotContext,
    copilotSelectedText,
    listeningParts,
    readingPassages,
    answerMap,
    reviewAnswerMap,
}: ResolveEffectiveContextArgs): ReviewCopilotContext => {
    if (skillType === 'LISTENING') {
        const referencedQuestionNumber = extractReferencedQuestionNumber(
            userMessage,
            copilotContext.focusedQuestionNumber,
        )
            ?? inferListeningQuestionNumberFromContextText({
                parts: listeningParts,
                text: copilotSelectedText,
            })
            ?? inferListeningQuestionNumberFromContextText({
                parts: listeningParts,
                text: userMessage,
            });

        if (referencedQuestionNumber == null) {
            return copilotContext;
        }

        const listeningQuestionFocus = findListeningQuestionFocusPayload({
            parts: listeningParts,
            questionNumber: referencedQuestionNumber,
            answerMap,
            reviewAnswerMap,
        });

        if (!listeningQuestionFocus) {
            return copilotContext;
        }

        return {
            ...copilotContext,
            currentFocusLabel: listeningQuestionFocus.label,
            currentFocusText: listeningQuestionFocus.text,
            focusedQuestionNumber: listeningQuestionFocus.questionNumber ?? referencedQuestionNumber,
            contextImages: mergeCopilotImages(copilotContext.contextImages, listeningQuestionFocus.images),
        };
    }

    if (skillType === 'READING') {
        const referencedQuestionNumbers = extractReferencedQuestionNumbers(
            userMessage,
            copilotContext.focusedQuestionNumber,
        );

        if (referencedQuestionNumbers.length === 0) {
            return copilotContext;
        }

        const readingQuestionFocuses = referencedQuestionNumbers
            .map((questionNumber) => findReadingQuestionFocusPayload({
                passages: readingPassages,
                questionNumber,
                answerMap,
                reviewAnswerMap,
            }))
            .filter((focus): focus is CopilotFocusPayload => !!focus);

        if (readingQuestionFocuses.length === 0) {
            return copilotContext;
        }

        const firstFocus = readingQuestionFocuses[0];
        const focusLabel = readingQuestionFocuses.length === 1
            ? firstFocus.label
            : `Câu ${referencedQuestionNumbers.join(', ')}`;
        const focusText = readingQuestionFocuses.length === 1
            ? firstFocus.text
            : readingQuestionFocuses
                .map((focus) => `=== ${focus.label} ===\n${focus.text}`)
                .join('\n\n');

        return {
            ...copilotContext,
            currentFocusLabel: focusLabel,
            currentFocusText: focusText,
            focusedQuestionNumber: readingQuestionFocuses.length === 1
                ? firstFocus.questionNumber ?? referencedQuestionNumbers[0]
                : null,
            contextImages: mergeCopilotImages(copilotContext.contextImages, ...readingQuestionFocuses.map((focus) => focus.images)),
        };
    }

    return copilotContext;
};

interface ResolveStreamingReplayActionArgs {
    skillType: string;
    sharedListeningAudioUrl?: string | null;
    accumulatedContent: string;
    requestedReplayQuestionNumber: number | null;
    effectiveCopilotContext: ReviewCopilotContext;
    localReplayAction: CopilotReplayAction | null;
    userMessage: string;
    listeningParts: PracticeSessionListeningPartDto[];
    activeItemIndex: number;
    reviewAnswerMap: Record<string, PracticeSessionAnswerDto>;
}

export const resolveStreamingReplayAction = ({
    skillType,
    sharedListeningAudioUrl,
    accumulatedContent,
    requestedReplayQuestionNumber,
    effectiveCopilotContext,
    localReplayAction,
    userMessage,
    listeningParts,
    activeItemIndex,
    reviewAnswerMap,
}: ResolveStreamingReplayActionArgs): CopilotReplayAction | null => {
    if (skillType !== 'LISTENING' || !sharedListeningAudioUrl) {
        return null;
    }

    const authoritativeReplayQuestionNumber = requestedReplayQuestionNumber
        ?? effectiveCopilotContext.focusedQuestionNumber
        ?? null;

    if (authoritativeReplayQuestionNumber == null) {
        return null;
    }

    const inferredReplay = inferCopilotReplayMatchFromText(accumulatedContent);
    if (!inferredReplay) {
        return localReplayAction;
    }

    const replayQuestionNumber = authoritativeReplayQuestionNumber;
    const inferredQuestionMatchesRequest = inferredReplay.questionNumber == null
        || inferredReplay.questionNumber === authoritativeReplayQuestionNumber;

    if (inferredReplay.answerStartSecond != null && inferredQuestionMatchesRequest) {
        if (localReplayAction && isCorrectAnswerQuery(userMessage)) {
            const isClose = Math.abs(inferredReplay.answerStartSecond - localReplayAction.playAtSecond) <= 15;
            if (!isClose) {
                return localReplayAction;
            }
        }

        const transcriptSnippet = resolveListeningTranscriptSnippetForReplay({
            parts: listeningParts,
            activePartIndex: activeItemIndex,
            answerStartSecond: inferredReplay.answerStartSecond,
            answerEndSecond: inferredReplay.answerEndSecond,
            questionNumber: replayQuestionNumber,
        }) ?? inferredReplay.transcriptSnippet;

        const replayScopeBounds = resolveListeningReplayScopeBounds({
            parts: listeningParts,
            activePartIndex: activeItemIndex,
            questionNumber: replayQuestionNumber,
        });

        return createListeningReplayAction({
            audioUrl: sharedListeningAudioUrl,
            answerStartSecond: inferredReplay.answerStartSecond,
            answerEndSecond: inferredReplay.answerEndSecond,
            replayStartLimitSecond: replayScopeBounds?.startSecond,
            replayEndLimitSecond: replayScopeBounds?.endSecond,
            transcriptSnippet,
            questionNumber: replayQuestionNumber,
        });
    }

    if (requestedReplayQuestionNumber != null) {
        const exactReplayAction = buildListeningReplayActionForQuestion({
            parts: listeningParts,
            activePartIndex: activeItemIndex,
            questionNumber: requestedReplayQuestionNumber,
            reviewAnswerMap,
        });

        if (exactReplayAction) {
            return exactReplayAction;
        }
    }

    if (inferredReplay.questionNumber != null && inferredQuestionMatchesRequest) {
        const exactReplayAction = buildListeningReplayActionForQuestion({
            parts: listeningParts,
            activePartIndex: activeItemIndex,
            questionNumber: inferredReplay.questionNumber,
            reviewAnswerMap,
        });

        if (exactReplayAction) {
            return exactReplayAction;
        }
    }

    return localReplayAction;
};

