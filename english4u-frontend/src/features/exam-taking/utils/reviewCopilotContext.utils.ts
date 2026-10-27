import { extractWritingTaskImageUrls } from '@/shared/lib/writingTaskAssets';
import type {
    PracticeSessionAnswerDto,
    PracticeSessionDto,
    PracticeSessionSpeakingQuestionDto,
} from '../types/session.types';
import type { ReviewCopilotContext } from '../types/copilot.types';
import {
    buildImagePayloads,
    dedupeImages,
    getGroupImagePayloads,
    normalizeText,
    parseAssetImageUrls,
    sortGroups,
} from './reviewCopilotBase.utils';
import {
    buildListeningPartBlock,
    buildReadingPassageBlock,
    buildReviewSummary,
    buildWritingTaskBlock,
    getWritingAnswerLookup,
    sortWritingTasks,
    type ObjectiveReviewAnswerMap,
} from './reviewCopilotObjectiveFormatters.utils';

// Re-export all submodules for complete backward compatibility
export * from './reviewCopilotBase.utils';
export * from './reviewCopilotListeningEvidence.utils';
export * from './reviewCopilotObjectiveFormatters.utils';
export * from './reviewCopilotFocus.utils';

export const buildObjectiveReviewCopilotContext = ({
    session,
    activeItemIndex,
    answerMap,
    reviewAnswerMap,
}: {
    session: PracticeSessionDto;
    activeItemIndex: number;
    answerMap: Record<string, string>;
    reviewAnswerMap: ObjectiveReviewAnswerMap;
}): ReviewCopilotContext => {
    const normalizedSkill = session.skillType.trim().toUpperCase();
    const sections = session.exam.sections.filter(
        (section) => section.skillType.trim().toUpperCase() === normalizedSkill,
    );
    const readingPassages = sections.flatMap((section) => section.readingPassages);
    const listeningParts = sections.flatMap((section) => section.listeningParts);

    const reviewBody = normalizedSkill === 'READING'
        ? readingPassages.map((passage) => buildReadingPassageBlock({ passage, answerMap, reviewAnswerMap }))
        : listeningParts.map((part) => buildListeningPartBlock({
            part,
            answerMap,
            reviewAnswerMap,
            includeTranscript: false,
        }));

    const activePassage = readingPassages[activeItemIndex];
    const activePart = listeningParts[activeItemIndex];

    const currentLocationLabel = normalizedSkill === 'READING'
        ? activePassage
            ? `Passage ${activePassage.passageNumber ?? activeItemIndex + 1}`
            : null
        : activePart
            ? `Part ${activePart.partNumber ?? activeItemIndex + 1}`
            : null;

    const currentLocationText = normalizedSkill === 'READING'
        ? activePassage
            ? buildReadingPassageBlock({ passage: activePassage, answerMap, reviewAnswerMap })
            : null
        : activePart
            ? buildListeningPartBlock({
                part: activePart,
                answerMap,
                reviewAnswerMap,
                includeTranscript: !normalizeText(activePart.contextDescription),
            })
            : null;

    const contextImages = normalizedSkill === 'READING' && activePassage
        ? dedupeImages([
            ...buildImagePayloads(
                parseAssetImageUrls(activePassage.assetsData),
                `Passage ${activePassage.passageNumber ?? activeItemIndex + 1}`,
            ),
            ...sortGroups(activePassage.questionGroups).flatMap((group) => getGroupImagePayloads(
                group,
                group.startQuestion != null && group.endQuestion != null
                    ? `Nhóm câu ${group.startQuestion}-${group.endQuestion}`
                    : 'Nhóm câu trong passage',
            )),
        ]).slice(0, 6)
        : normalizedSkill === 'LISTENING' && activePart
            ? dedupeImages(
                sortGroups(activePart.questionGroups).flatMap((group) => getGroupImagePayloads(
                    group,
                    group.startQuestion != null && group.endQuestion != null
                        ? `Nhóm câu ${group.startQuestion}-${group.endQuestion}`
                        : `Part ${activePart.partNumber ?? activeItemIndex + 1}`,
                )),
            ).slice(0, 6)
            : [];

    return {
        sessionId: session.sessionId,
        reviewTitle: session.examTitle,
        reviewDocumentText: [
            buildReviewSummary(session),
            ...reviewBody,
        ].filter(Boolean).join('\n\n====================\n\n'),
        skillType: normalizedSkill,
        currentLocationLabel,
        currentLocationText,
        currentFocusLabel: null,
        currentFocusText: null,
        focusedQuestionNumber: null,
        selectedText: null,
        selectedTextLabel: null,
        contextImages,
    };
};

export const buildWritingReviewCopilotContext = ({
    session,
}: {
    session: PracticeSessionDto;
}): ReviewCopilotContext => {
    const writingTasks = sortWritingTasks(
        session.exam.sections
            .filter((section) => section.skillType.trim().toUpperCase() === 'WRITING')
            .flatMap((section) => section.writingTasks),
    );
    const answerLookup = getWritingAnswerLookup(session);
    const reviewBody = writingTasks.map((task) => buildWritingTaskBlock({
        task,
        answer: answerLookup[task.id],
    }));
    const contextImages = dedupeImages(
        writingTasks.flatMap((task) => buildImagePayloads(
            extractWritingTaskImageUrls(task.assetsData),
            task.taskNumber != null ? `Task ${task.taskNumber}` : 'Task Writing',
        )),
    ).slice(0, 6);

    return {
        sessionId: session.sessionId,
        reviewTitle: session.examTitle,
        reviewDocumentText: [
            buildReviewSummary(session),
            ...reviewBody,
        ].filter(Boolean).join('\n\n====================\n\n'),
        skillType: 'WRITING',
        currentLocationLabel: 'Writing review',
        currentLocationText: reviewBody.join('\n\n--------------------\n\n') || null,
        currentFocusLabel: null,
        currentFocusText: null,
        focusedQuestionNumber: null,
        selectedText: null,
        selectedTextLabel: null,
        contextImages,
    };
};

const sortSpeakingParts = (parts: any[]) =>
    [...parts].sort((left, right) => (left.partNumber ?? 0) - (right.partNumber ?? 0));

const sortSpeakingQuestions = (questions: any[]) =>
    [...questions].sort((left, right) => (left.orderIndex ?? 0) - (right.orderIndex ?? 0));

const buildSpeakingQuestionBlock = ({
    question,
    partNumber,
    answer,
}: {
    question: PracticeSessionSpeakingQuestionDto;
    partNumber: number | null;
    answer?: PracticeSessionAnswerDto;
}) => {
    const lines: string[] = [];
    lines.push(`Part ${partNumber ?? ''} Question: "${question.content}"`);
    if (question.cueCardPoints) {
        lines.push(`Cue Card talking points:\n${question.cueCardPoints}`);
    }
    if (answer) {
        lines.push(`Student Notes: ${answer.answerText || 'None'}`);
        lines.push(`Recorded Duration: ${answer.durationSeconds ? `${answer.durationSeconds.toFixed(1)}s` : 'N/A'}`);
        lines.push(`Speech ASR Transcript: "${answer.transcriptText || 'None'}"`);
        if (answer.scoreEarned) {
            lines.push(`Estimated Band Score: ${answer.scoreEarned.toFixed(1)}`);
        }
        if (answer.speakingAnalytics) {
            const ana = answer.speakingAnalytics;
            lines.push(`Speech Analytics: pace=${ana.paceLabel || 'N/A'}, coverage=${ana.coverageLabel || 'N/A'}, wpm=${ana.wordsPerMinute ?? 'N/A'}, target=${ana.targetDurationSeconds ?? 'N/A'}s`);
        }
        if (answer.feedbacks && answer.feedbacks.length > 0) {
            lines.push('Detailed Feedback:');
            answer.feedbacks.forEach((fb) => {
                lines.push(`- Criteria: ${fb.criteria} (Band ${fb.bandScore.toFixed(1)})`);
                if (fb.comment) lines.push(`  Comment: ${fb.comment}`);
                if (fb.improvements) lines.push(`  Improvements: ${fb.improvements}`);
                if (fb.evidence && fb.evidence.length > 0) {
                    lines.push(`  Evidence tokens: ${fb.evidence.join(', ')}`);
                }
            });
        }
    } else {
        lines.push('Student Response: (No recording / answer provided)');
    }
    return lines.join('\n');
};

export const buildSpeakingReviewCopilotContext = ({
    session,
}: {
    session: PracticeSessionDto;
}): ReviewCopilotContext => {
    const speakingSections = session.exam.sections.filter(
        (sec) => sec.skillType.trim().toUpperCase() === 'SPEAKING'
    );
    const speakingParts = sortSpeakingParts(
        speakingSections.flatMap((sec) => sec.speakingParts || [])
    );

    const answerLookup: Record<string, PracticeSessionAnswerDto> = {};
    (session.answers || []).forEach((ans) => {
        if (ans.speakingQuestionId) {
            answerLookup[ans.speakingQuestionId] = ans;
        }
    });

    const reviewBody: string[] = [];
    speakingParts.forEach((part) => {
        const sortedQs = sortSpeakingQuestions(part.questions || []);
        sortedQs.forEach((q) => {
            reviewBody.push(
                buildSpeakingQuestionBlock({
                    question: q,
                    partNumber: part.partNumber,
                    answer: answerLookup[q.id],
                })
            );
        });
    });

    return {
        sessionId: session.sessionId,
        reviewTitle: session.examTitle,
        reviewDocumentText: [
            buildReviewSummary(session),
            ...reviewBody,
        ].filter(Boolean).join('\n\n====================\n\n'),
        skillType: 'SPEAKING',
        currentLocationLabel: 'Speaking review',
        currentLocationText: reviewBody.join('\n\n--------------------\n\n') || null,
        currentFocusLabel: null,
        currentFocusText: null,
        focusedQuestionNumber: null,
        selectedText: null,
        selectedTextLabel: null,
        contextImages: [],
    };
};
