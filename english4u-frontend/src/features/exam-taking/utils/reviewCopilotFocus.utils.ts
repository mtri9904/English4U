import { extractWritingTaskImageUrls } from '@/shared/lib/writingTaskAssets';
import type { CopilotFocusPayload } from '../types/copilot.types';
import type {
    PracticeSessionAnswerDto,
    PracticeSessionListeningPartDto,
    PracticeSessionQuestionDto,
    PracticeSessionQuestionGroupDto,
    PracticeSessionReadingPassageDto,
    PracticeSessionWritingTaskDto,
} from '../types/session.types';
import {
    buildImagePayloads,
    dedupeImages,
    getGroupImagePayloads,
    normalizeText,
    parseAssetImageUrls,
    sortGroups,
    sortQuestions,
} from './reviewCopilotBase.utils';
import {
    buildListeningTranscriptWindowText,
    buildQuestionBlock,
    buildWritingTaskBlock,
    formatReadingPassageTextForCopilot,
    type ObjectiveReviewAnswerMap,
} from './reviewCopilotObjectiveFormatters.utils';

export const buildQuestionFocusPayload = ({
    group,
    question,
    reviewAnswer,
    userAnswer,
}: {
    group: PracticeSessionQuestionGroupDto;
    question: PracticeSessionQuestionDto;
    reviewAnswer?: PracticeSessionAnswerDto;
    userAnswer?: string | null;
}): CopilotFocusPayload => {
    const label = question.questionNumber != null ? `Câu ${question.questionNumber}` : 'Câu đang chọn';
    const images = getGroupImagePayloads(
        group,
        label,
        question,
    );

    return {
        label,
        text: [
            buildQuestionBlock({
                group,
                question,
                reviewAnswer,
                userAnswer,
            }),
            images.length > 0
                ? 'Câu này có ảnh/sơ đồ/bảng/map liên quan đã được đính kèm cho AI. Khi giải thích, hãy đối chiếu cả chi tiết trong ảnh với passage/transcript nếu đáp án phụ thuộc vào hình.'
                : '',
        ].filter(Boolean).join('\n'),
        questionNumber: question.questionNumber,
        images,
    };
};

export const buildListeningQuestionFocusPayload = ({
    parts,
    group,
    question,
    reviewAnswer,
    userAnswer,
}: {
    parts: PracticeSessionListeningPartDto[];
    group: PracticeSessionQuestionGroupDto;
    question: PracticeSessionQuestionDto;
    reviewAnswer?: PracticeSessionAnswerDto;
    userAnswer?: string | null;
}): CopilotFocusPayload => {
    const baseFocus = buildQuestionFocusPayload({
        group,
        question,
        reviewAnswer,
        userAnswer,
    });
    const listeningPart = parts.find((part) => part.questionGroups.some((questionGroup) => questionGroup.id === group.id))
        ?? parts.find((part) => part.questionGroups.some((questionGroup) => questionGroup.questions.some((item) => item.id === question.id)))
        ?? null;
    const transcriptWindowText = listeningPart && question.questionNumber != null
        ? buildListeningTranscriptWindowText(listeningPart, {
            questionNumber: question.questionNumber,
            group,
            reviewAnswer,
        })
        : '';

    return transcriptWindowText
        ? {
            ...baseFocus,
            text: [
                baseFocus.text,
                `Transcript window của câu ${question.questionNumber}:`,
                transcriptWindowText,
            ].join('\n\n'),
        }
        : baseFocus;
};

export const findListeningQuestionFocusPayload = ({
    parts,
    questionNumber,
    answerMap,
    reviewAnswerMap,
}: {
    parts: PracticeSessionListeningPartDto[];
    questionNumber: number;
    answerMap: Record<string, string>;
    reviewAnswerMap: ObjectiveReviewAnswerMap;
}): CopilotFocusPayload | null => {
    for (const part of parts) {
        for (const group of sortGroups(part.questionGroups)) {
            for (const question of sortQuestions(group.questions)) {
                if (question.questionNumber !== questionNumber) {
                    continue;
                }

                return buildListeningQuestionFocusPayload({
                    parts,
                    group,
                    question,
                    reviewAnswer: reviewAnswerMap[question.id],
                    userAnswer: answerMap[question.id] ?? reviewAnswerMap[question.id]?.answerText,
                });
            }
        }
    }

    return null;
};

export const findReadingQuestionFocusPayload = ({
    passages,
    questionNumber,
    answerMap,
    reviewAnswerMap,
}: {
    passages: PracticeSessionReadingPassageDto[];
    questionNumber: number;
    answerMap: Record<string, string>;
    reviewAnswerMap: ObjectiveReviewAnswerMap;
}): CopilotFocusPayload | null => {
    for (const passage of passages) {
        for (const group of sortGroups(passage.questionGroups)) {
            for (const question of sortQuestions(group.questions)) {
                if (question.questionNumber !== questionNumber) {
                    continue;
                }

                const baseFocus = buildQuestionFocusPayload({
                    group,
                    question,
                    reviewAnswer: reviewAnswerMap[question.id],
                    userAnswer: answerMap[question.id] ?? reviewAnswerMap[question.id]?.answerText,
                });
                const passageLabel = `Passage ${passage.passageNumber ?? 'N/A'}${passage.title ? `: ${normalizeText(passage.title)}` : ''}`;

                return {
                    ...baseFocus,
                    text: [
                        passageLabel,
                        `Bài đọc liên quan:\n${formatReadingPassageTextForCopilot(passage.paragraphsData) || 'Passage chưa có nội dung.'}`,
                        `Câu hỏi cần giải thích:\n${baseFocus.text}`,
                    ].join('\n\n'),
                    images: dedupeImages([
                        ...buildImagePayloads(
                            parseAssetImageUrls(passage.assetsData),
                            passageLabel,
                        ),
                        ...(baseFocus.images ?? []),
                    ]),
                };
            }
        }
    }

    return null;
};

export const buildWritingTaskFocusPayload = ({
    task,
    answer,
}: {
    task: PracticeSessionWritingTaskDto;
    answer?: PracticeSessionAnswerDto;
}): CopilotFocusPayload => ({
    label: task.taskNumber != null ? `Task ${task.taskNumber}` : 'Task đang chọn',
    text: buildWritingTaskBlock({ task, answer }),
    questionNumber: null,
    images: buildImagePayloads(
        extractWritingTaskImageUrls(task.assetsData),
        task.taskNumber != null ? `Task ${task.taskNumber}` : 'Task đang chọn',
    ),
});

