import { countWords } from './sessionReview.utils';
import { extractWritingTaskHiddenDataText } from '@/shared/lib/writingTaskAssets';
import { buildReadingPassageDisplaySegments, splitReadingParagraphIntoSentences } from './readingPassage.utils';
import type {
    PracticeSessionAnswerDto,
    PracticeSessionDto,
    PracticeSessionFeedbackDto,
    PracticeSessionListeningPartDto,
    PracticeSessionQuestionDto,
    PracticeSessionQuestionGroupDto,
    PracticeSessionReadingPassageDto,
    PracticeSessionWritingTaskDto,
} from '../types/session.types';
import {
    extractPromptText,
    formatAnswerTokensForCopilot,
    getAnswerOptions,
    isChooseNGroup,
    normalizeInlineTokenText,
    normalizeText,
    resolveAnswerText,
    sortGroups,
    sortQuestions,
} from './reviewCopilotBase.utils';
import {
    resolveQuestionSpecificCorrectAnswer,
} from './reviewCopilotListeningEvidence.utils';
import {
    buildListeningPartBlock as buildListeningPartBlockHelper,
    type ObjectiveReviewAnswerMap,
} from './reviewCopilotListeningFormatters.utils';

export type { ObjectiveReviewAnswerMap } from './reviewCopilotListeningFormatters.utils';
export {
    buildListeningAnchorFallbackWindow,
    buildListeningTranscriptWindowText,
    findNearestListeningQuestionAnchors,
    formatListeningSegmentsWindowForCopilot,
    getListeningPartQuestionNumbers,
    getListeningTranscriptWindowConfig,
    getNormalizedListeningGroupType,
} from './reviewCopilotListeningFormatters.utils';

export const buildQuestionText = (group: PracticeSessionQuestionGroupDto, question: PracticeSessionQuestionDto) => {
    const blocks = [
        normalizeInlineTokenText(group.instruction),
        extractPromptText(group),
        normalizeInlineTokenText(question.content),
    ].filter(Boolean);

    if (blocks.length === 0 && question.questionNumber != null) {
        return `Question ${question.questionNumber}`;
    }

    return blocks.join('\n\n');
};

export const buildAnswerStatus = (reviewAnswer?: PracticeSessionAnswerDto) => {
    if (reviewAnswer?.isCorrect === true) {
        return 'Đúng';
    }

    if (reviewAnswer?.isCorrect === false) {
        return 'Sai';
    }

    return 'Chưa chấm';
};

export const buildQuestionBlock = ({
    group,
    question,
    reviewAnswer,
    userAnswer,
}: {
    group: PracticeSessionQuestionGroupDto;
    question: PracticeSessionQuestionDto;
    reviewAnswer?: PracticeSessionAnswerDto;
    userAnswer?: string | null;
}) => {
    const options = getAnswerOptions(group, question);
    const finalUserAnswer = normalizeText(userAnswer ?? reviewAnswer?.answerText) || null;
    const correctAnswer = resolveQuestionSpecificCorrectAnswer(group, question, reviewAnswer) || null;
    const correctAnswerForDisplay = formatAnswerTokensForCopilot(correctAnswer);
    const chooseNGroup = isChooseNGroup(group);
    const questionNumbers = sortQuestions(group.questions)
        .flatMap((item) => item.questionNumber != null ? [item.questionNumber] : []);
    const chooseNRange = questionNumbers.length > 0
        ? `câu ${questionNumbers[0]}-${questionNumbers[questionNumbers.length - 1]}`
        : 'nhóm câu này';
    const correctAnswerLabel = 'Đáp án đúng';
    const userAnswerLabel = chooseNGroup
        ? 'Học viên nhập ở ô này'
        : 'Học viên chọn';
    const lines = [
        `Câu ${question.questionNumber ?? 'N/A'}`,
        `Nội dung: ${buildQuestionText(group, question) || 'Không có nội dung riêng.'}`,
        chooseNGroup
            ? `Lưu ý: Câu ${question.questionNumber ?? 'N/A'} là một ô trong ${chooseNRange}; hệ thống gộp checkbox theo thứ tự từ trên xuống rồi đối chiếu với đáp án đúng riêng của ô này.`
            : '',
        correctAnswer ? `${correctAnswerLabel}: ${correctAnswerForDisplay}` : `${correctAnswerLabel}: Không rõ`,
        (() => {
            const resolved = resolveAnswerText(correctAnswer, options);
            return resolved ? `Diễn giải đáp án đúng: ${resolved}` : '';
        })(),
        finalUserAnswer ? `${userAnswerLabel}: ${finalUserAnswer}` : `${userAnswerLabel}: Chưa trả lời`,
        (() => {
            const resolved = resolveAnswerText(finalUserAnswer, options);
            return resolved ? `Diễn giải đáp án của học viên: ${resolved}` : '';
        })(),
        `Trạng thái: ${buildAnswerStatus(reviewAnswer)}`,
        (reviewAnswer as any)?.explanation ? `Giải thích sẵn có: ${normalizeText((reviewAnswer as any).explanation)}` : '',
    ].filter(Boolean);

    return lines.join('\n');
};

export const buildGroupBlock = ({
    group,
    answerMap,
    reviewAnswerMap,
}: {
    group: PracticeSessionQuestionGroupDto;
    answerMap: Record<string, string>;
    reviewAnswerMap: ObjectiveReviewAnswerMap;
}) => {
    const prompt = extractPromptText(group);
    const instruction = normalizeInlineTokenText(group.instruction);
    const chooseNGroup = isChooseNGroup(group);
    const options = getAnswerOptions(group);
    const lines = [
        `Nhóm câu hỏi: ${group.groupType}`,
        instruction ? `Hướng dẫn: ${instruction}` : '',
        prompt ? `Nội dung nhóm:\n${prompt}` : '',
        chooseNGroup
            ? 'Cơ chế chấm: Nhóm câu này là dạng chọn nhiều đáp án (Choose N). Học viên tick nhiều checkbox trên một danh sách lựa chọn chung; mỗi checkbox được tick tương ứng với một ô trả lời theo thứ tự từ trên xuống.'
            : '',
        options.length > 0
            ? `Danh sách lựa chọn:\n${options.map((option) => `- ${option.label ? `${option.label}. ` : ''}${option.text}`).join('\n')}`
            : '',
        ...sortQuestions(group.questions).map((question) => {
            const reviewAnswer = reviewAnswerMap[question.id];
            const userAnswer = answerMap[question.id];
            return buildQuestionBlock({ group, question, reviewAnswer, userAnswer });
        }),
    ].filter(Boolean);

    return lines.join('\n\n');
};

export const formatReadingPassageTextForCopilot = (paragraphsData?: string | null) => {
    const segments = buildReadingPassageDisplaySegments(paragraphsData);
    if (segments.length === 0) {
        return '';
    }

    return segments
        .map((segment) => {
            const label = segment.paragraphNumber ? `[Paragraph ${segment.paragraphNumber}]` : '';
            const sentences = splitReadingParagraphIntoSentences(segment.text)
                .map((sentence, index) => `(S${index + 1}) ${sentence}`)
                .join(' ');
            return [label, sentences].filter(Boolean).join(' ');
        })
        .join('\n\n');
};

export const buildReadingPassageBlock = ({
    passage,
    answerMap,
    reviewAnswerMap,
}: {
    passage: PracticeSessionReadingPassageDto;
    answerMap: Record<string, string>;
    reviewAnswerMap: ObjectiveReviewAnswerMap;
}) => {
    const heading = `Passage ${passage.passageNumber ?? 'N/A'}${passage.title ? `: ${passage.title}` : ''}`;

    return [
        heading,
        formatReadingPassageTextForCopilot(passage.paragraphsData) || 'Passage chưa có nội dung.',
        ...sortGroups(passage.questionGroups).map((group) => buildGroupBlock({ group, answerMap, reviewAnswerMap })),
    ].filter(Boolean).join('\n\n');
};

export const buildListeningPartBlock = ({
    part,
    answerMap,
    reviewAnswerMap,
    includeTranscript = false,
}: {
    part: PracticeSessionListeningPartDto;
    answerMap: Record<string, string>;
    reviewAnswerMap: ObjectiveReviewAnswerMap;
    includeTranscript?: boolean;
}) => {
    return buildListeningPartBlockHelper({
        part,
        answerMap,
        reviewAnswerMap,
        buildGroupBlock,
        includeTranscript,
    });
};

export const buildReviewSummary = (session: PracticeSessionDto) => {
    const resultLines = [
        `Bài thi: ${session.examTitle}`,
        session.examDescription ? `Mô tả: ${normalizeText(session.examDescription)}` : '',
        `Kỹ năng: ${session.skillType}`,
        `Trạng thái: ${session.status}`,
        `Đã trả lời: ${session.answeredQuestions}/${session.totalQuestions}`,
        session.result ? `Độ chính xác: ${session.result.accuracyPercent.toFixed(1)}%` : '',
        session.result?.readingScore != null ? `Reading band: ${session.result.readingScore.toFixed(1)}` : '',
        session.result?.listeningScore != null ? `Listening band: ${session.result.listeningScore.toFixed(1)}` : '',
        session.result?.writingScore != null ? `Writing band: ${session.result.writingScore.toFixed(1)}` : '',
        session.result?.totalBandScore != null ? `Overall band: ${session.result.totalBandScore.toFixed(1)}` : '',
        session.result?.overallFeedback ? `Overall feedback: ${normalizeText(session.result.overallFeedback)}` : '',
    ].filter(Boolean);

    return resultLines.join('\n');
};

export const buildWritingFeedbackBlock = (feedbacks?: PracticeSessionFeedbackDto[] | null) => {
    if (!feedbacks || feedbacks.length === 0) {
        return '';
    }

    return feedbacks
        .map((feedback) => {
            const lines = [
                `- ${feedback.criteria}: band ${feedback.bandScore > 0 ? feedback.bandScore.toFixed(1) : '—'}`,
                feedback.comment ? `  Nhận xét: ${normalizeText(feedback.comment)}` : '',
                feedback.improvements ? `  Cải thiện: ${normalizeText(feedback.improvements)}` : '',
            ].filter(Boolean);

            return lines.join('\n');
        })
        .join('\n');
};

export const getWritingAnswerLookup = (session: PracticeSessionDto) => (
    session.answers.reduce<Record<string, PracticeSessionAnswerDto | undefined>>((accumulator, answer) => {
        if (answer.writingTaskId) {
            accumulator[answer.writingTaskId] = answer;
        }

        return accumulator;
    }, {})
);



export const sortWritingTasks = (tasks: PracticeSessionWritingTaskDto[]) => (
    [...tasks].sort((left, right) => {
        const leftOrder = left.taskNumber ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = right.taskNumber ?? Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder || left.id.localeCompare(right.id);
    })
);

export const buildWritingTaskBlock = ({
    task,
    answer,
}: {
    task: PracticeSessionWritingTaskDto;
    answer?: PracticeSessionAnswerDto;
}) => {
    const normalizedAnswerText = normalizeText(answer?.answerText);
    const feedbackBlock = buildWritingFeedbackBlock(answer?.feedbacks);
    const hiddenDataText = normalizeText(extractWritingTaskHiddenDataText(task.assetsData));
    const lines = [
        `Task ${task.taskNumber ?? 'N/A'}`,
        `Đề bài: ${normalizeText(task.promptText) || 'Không có đề bài.'}`,
        `Số từ tối thiểu: ${task.minWords}`,
        hiddenDataText ? `Dữ liệu chuẩn của biểu đồ/hình để AI đối chiếu:\n${hiddenDataText}` : '',
        normalizedAnswerText
            ? `Bài làm của học viên:\n${normalizedAnswerText}`
            : 'Bài làm của học viên: Chưa có nội dung được lưu.',
        normalizedAnswerText ? `Số từ hiện có: ${countWords(normalizedAnswerText)}` : '',
        answer?.scoreEarned != null && answer.scoreEarned > 0 ? `Band task: ${answer.scoreEarned.toFixed(1)}` : '',
        feedbackBlock ? `Feedback AI:\n${feedbackBlock}` : '',
    ].filter(Boolean);

    return lines.join('\n\n');
};

