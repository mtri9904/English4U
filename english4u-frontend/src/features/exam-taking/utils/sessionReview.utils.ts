import type {
    PracticeSessionDto,
    PracticeSessionAnswerDto,
    PracticeSessionFeedbackDto,
    PracticeSessionRewardDto,
} from '../types/session.types';
import { extractWritingTaskImageUrls } from '@/shared/lib/writingTaskAssets';
import {
    SESSION_STATUS_LABEL_MAP,
    WRITING_SUBMIT_MIN_WORDS,
    WRITING_CRITERIA,
    WRITING_CRITERIA_LABELS,
    WRITING_CRITERIA_GUIDE_MAP,
    statusLabelMap,
    writingCriteria,
    writingCriteriaLabels,
    writingCriteriaGuideMap,
} from '../constants/session.constants';

export {
    SESSION_STATUS_LABEL_MAP,
    WRITING_SUBMIT_MIN_WORDS,
    WRITING_CRITERIA,
    WRITING_CRITERIA_LABELS,
    WRITING_CRITERIA_GUIDE_MAP,
    statusLabelMap,
    writingCriteria,
    writingCriteriaLabels,
    writingCriteriaGuideMap,
};

export const formatSeconds = (value?: number | null) => {
    if (value == null) {
        return 'Không giới hạn';
    }

    const total = Math.max(0, value);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export const getSessionStatusLabel = (status?: string | null) => (
    status ? SESSION_STATUS_LABEL_MAP[status] ?? status : 'N/A'
);

export const formatRewardSummary = (reward?: PracticeSessionRewardDto | null) => {
    if (!reward || reward.dailyStreakCount <= 0) {
        return null;
    }

    return `🔥 Streak ${reward.dailyStreakCount} ngày`;
};

export const countWords = (value?: string | null) => {
    const trimmed = (value ?? '').trim();
    if (!trimmed) {
        return 0;
    }

    return trimmed.split(/\s+/).filter(Boolean).length;
};

export const getWritingTasks = (session?: PracticeSessionDto | null) => (
    session?.exam.sections
        .filter((section) => section.skillType.trim().toUpperCase() === 'WRITING')
        .flatMap((section) => section.writingTasks ?? [])
        .sort((left, right) => (left.taskNumber ?? 0) - (right.taskNumber ?? 0)) ?? []
);

export const parseWritingAssets = (instructions?: string | null) => {
    const rawUrls = extractWritingTaskImageUrls(instructions);
    const uniqueUrls: string[] = [];
    const seen = new Set<string>();

    rawUrls.forEach((url) => {
        const normalized = url.trim();
        if (!normalized || seen.has(normalized)) {
            return;
        }

        seen.add(normalized);
        uniqueUrls.push(normalized);
    });

    return {
        imageUrls: uniqueUrls,
        hasImages: uniqueUrls.length > 0,
        cleanedInstructions: instructions ?? '',
    };
};

export const getWritingAnswerMap = (
    sessionOrAnswers?: PracticeSessionDto | Record<string, string> | null,
): Record<string, string> => {
    if (!sessionOrAnswers) return {};
    if ('answers' in sessionOrAnswers && Array.isArray(sessionOrAnswers.answers)) {
        const result: Record<string, string> = {};
        sessionOrAnswers.answers.forEach((ans) => {
            if (ans.writingTaskId && ans.answerText) {
                result[ans.writingTaskId] = ans.answerText;
            }
        });
        return result;
    }
    return sessionOrAnswers as Record<string, string>;
};

export const getWritingReviewAnswerMap = (session?: PracticeSessionDto | null) => {
    const result: Record<string, PracticeSessionAnswerDto> = {};
    (session?.answers ?? []).forEach((answer) => {
        if (answer.writingTaskId) {
            result[answer.writingTaskId] = answer;
        }
    });

    return result;
};

export const getInvalidWritingTaskNumbers = (
    session?: PracticeSessionDto | null,
    answers: Record<string, string> = {},
) => {
    const invalidTasks: number[] = [];
    const tasks = getWritingTasks(session);

    tasks.forEach((task, index) => {
        const text = answers[task.id] ?? '';
        if (countWords(text) < WRITING_SUBMIT_MIN_WORDS) {
            invalidTasks.push(task.taskNumber ?? index + 1);
        }
    });

    return invalidTasks;
};

export const roundIeltsBand = (value: number) => Math.round(Math.max(0, Math.min(9, value)) * 2) / 2;

export const getWritingFeedbacks = (session?: PracticeSessionDto | null) => (
    (session?.answers ?? [])
        .filter((answer) => answer.writingTaskId)
        .flatMap((answer) => answer.feedbacks ?? [])
);

export const matchWritingFeedbackCriteria = (feedbacks: PracticeSessionFeedbackDto[], criteria: string) => (
    feedbacks.find((feedback) => feedback.criteria === criteria)
    ?? feedbacks.find((feedback) => feedback.criteria.toLowerCase().includes(criteria.toLowerCase().split(' ')[0]))
);

export const orderWritingFeedbacksByCriteria = (feedbacks: PracticeSessionFeedbackDto[]) => (
    WRITING_CRITERIA.map((criteria) => (
        matchWritingFeedbackCriteria(feedbacks, criteria)
        ?? { criteria, bandScore: 0, comment: null, improvements: null }
    ))
);

export const calculateFeedbackAverageBand = (feedbacks: PracticeSessionFeedbackDto[]) => {
    const validFeedbacks = feedbacks.filter((feedback) => feedback.bandScore > 0);
    if (validFeedbacks.length === 0) {
        return null;
    }

    return roundIeltsBand(validFeedbacks.reduce((total, feedback) => total + feedback.bandScore, 0) / validFeedbacks.length);
};

export const getWeightedWritingFeedbackByCriteria = (session?: PracticeSessionDto | null): PracticeSessionFeedbackDto[] => (
    WRITING_CRITERIA.map((criteria) => {
        let weightedTotal = 0;
        let totalWeight = 0;

        (session?.answers ?? [])
            .filter((answer) => answer.writingTaskId && (answer.feedbacks?.length ?? 0) > 0)
            .forEach((answer) => {
                const feedback = matchWritingFeedbackCriteria(answer.feedbacks ?? [], criteria);
                if (!feedback) {
                    return;
                }

                const weight = answer.writingTaskNumber === 2 ? 2 : 1;
                weightedTotal += feedback.bandScore * weight;
                totalWeight += weight;
            });

        return {
            criteria,
            bandScore: totalWeight > 0 ? roundIeltsBand(weightedTotal / totalWeight) : 0,
            comment: 'Điểm tổng hợp từ các task đã chấm; Task 2 được tính hệ số 2.',
            improvements: 'Xem feedback từng task bên dưới để biết chi tiết cần cải thiện.',
        };
    })
);

export const getWritingTaskChartData = (session?: PracticeSessionDto | null) => (
    (session?.answers ?? [])
        .filter((answer) => answer.writingTaskId && (answer.feedbacks?.length ?? 0) > 0)
        .sort((left, right) => (left.writingTaskNumber ?? 0) - (right.writingTaskNumber ?? 0))
        .map((answer, index) => {
            const feedbacks = orderWritingFeedbacksByCriteria(answer.feedbacks ?? []);
            return {
                key: answer.writingTaskId ?? `writing-task-${index}`,
                taskNumber: answer.writingTaskNumber ?? index + 1,
                band: answer.scoreEarned > 0 ? roundIeltsBand(answer.scoreEarned) : calculateFeedbackAverageBand(feedbacks),
                feedbacks,
            };
        })
);

export const getWritingTaskFeedbackSections = (session?: PracticeSessionDto | null) => (
    (session?.answers ?? [])
        .filter((answer) => answer.writingTaskId && (answer.feedbacks?.length ?? 0) > 0)
        .sort((left, right) => (left.writingTaskNumber ?? 0) - (right.writingTaskNumber ?? 0))
        .map((answer, index) => {
            const feedbacks = orderWritingFeedbacksByCriteria(answer.feedbacks ?? []);
            return {
                key: answer.writingTaskId ?? `writing-task-feedback-${index}`,
                taskNumber: answer.writingTaskNumber ?? index + 1,
                band: answer.scoreEarned > 0 ? roundIeltsBand(answer.scoreEarned) : calculateFeedbackAverageBand(feedbacks),
                feedbacks,
            };
        })
);

export const buildObjectiveAnswerMap = (session: PracticeSessionDto) => (
    (session?.answers ?? []).reduce<Record<string, string>>((accumulator, answer) => {
        if (answer.questionId) {
            accumulator[answer.questionId] = answer.answerText ?? '';
        }
        return accumulator;
    }, {})
);

export const buildObjectiveReviewAnswerMap = (session: PracticeSessionDto) => (
    (session?.answers ?? []).reduce<Record<string, PracticeSessionDto['answers'][number]>>((accumulator, answer) => {
        if (answer.questionId) {
            accumulator[answer.questionId] = answer;
        }
        return accumulator;
    }, {})
);


