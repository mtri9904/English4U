import type {
    PracticeSessionDto,
    PracticeSessionAnswerDto,
    PracticeSessionFeedbackDto,
    PracticeSessionRewardDto,
} from '../types/session.types';
import { extractWritingTaskImageUrls } from '@/shared/lib/writingTaskAssets';

export const statusLabelMap: Record<string, string> = {
    NotStarted: 'Chưa bắt đầu',
    InProgress: 'Đang làm bài',
    Submitted: 'Đã nộp',
    Completed: 'Hoàn thành',
    Abandoned: 'Đã hủy',
};

export const WRITING_SUBMIT_MIN_WORDS = 10;

export const formatSeconds = (value?: number | null) => {
    if (value == null) {
        return 'Khong gioi han';
    }

    const total = Math.max(0, value);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export const getSessionStatusLabel = (status?: string | null) => (
    status ? statusLabelMap[status] ?? status : 'N/A'
);

export const formatRewardSummary = (reward?: PracticeSessionRewardDto | null) => {
    if (!reward) {
        return null;
    }

    const rewardLabel = reward.experienceAwarded > 0
        ? `+${reward.experienceAwarded} XP`
        : 'Đề này đã được tính XP trước đó';
    const levelLabel = reward.levelUpOccurred
        ? `Lv.${reward.currentLevel} - lên cấp`
        : `Lv.${reward.currentLevel}`;

    return `${rewardLabel} • Streak ${reward.dailyStreakCount} ngày • ${levelLabel}`;
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
        .flatMap((section) => section.writingTasks)
        .sort((left, right) => (left.taskNumber ?? 0) - (right.taskNumber ?? 0)) ?? []
);

export const getWritingAnswerMap = (session?: PracticeSessionDto | null) => (
    (session?.answers ?? []).reduce<Record<string, string>>((accumulator, answer) => {
        if (answer.writingTaskId && answer.answerText) {
            accumulator[answer.writingTaskId] = answer.answerText;
        }
        return accumulator;
    }, {})
);

export const getWritingReviewAnswerMap = (session?: PracticeSessionDto | null) => (
    (session?.answers ?? []).reduce<Record<string, PracticeSessionAnswerDto | undefined>>((accumulator, answer) => {
        if (answer.writingTaskId) {
            accumulator[answer.writingTaskId] = answer;
        }

        return accumulator;
    }, {})
);

export const parseWritingAssets = (assetsData?: string | null) => {
    return extractWritingTaskImageUrls(assetsData);
};

export const getInvalidWritingTaskNumbers = (session?: PracticeSessionDto | null) => {
    const answerMap = getWritingAnswerMap(session);
    return getWritingTasks(session)
        .filter((task) => countWords(answerMap[task.id]) < WRITING_SUBMIT_MIN_WORDS)
        .map((task, index) => task.taskNumber ?? index + 1);
};

export const buildObjectiveAnswerMap = (session: PracticeSessionDto) => (
    session.answers.reduce<Record<string, string>>((accumulator, answer) => {
        if (answer.questionId) {
            accumulator[answer.questionId] = answer.answerText ?? '';
        }
        return accumulator;
    }, {})
);

export const buildObjectiveReviewAnswerMap = (session: PracticeSessionDto) => (
    session.answers.reduce<Record<string, PracticeSessionDto['answers'][number]>>((accumulator, answer) => {
        if (answer.questionId) {
            accumulator[answer.questionId] = answer;
        }
        return accumulator;
    }, {})
);

export const writingCriteria = [
    'Task Achievement/Response',
    'Coherence and Cohesion',
    'Lexical Resource',
    'Grammatical Range and Accuracy',
];

export const writingCriteriaLabels: Record<string, string> = {
    'Task Achievement/Response': 'TA/TR',
    'Coherence and Cohesion': 'CC',
    'Lexical Resource': 'LR',
    'Grammatical Range and Accuracy': 'GRA',
};

export const writingCriteriaGuideMap: Record<string, string[]> = {
    'Task Achievement/Response': [
        'Đánh giá mức độ bạn đáp ứng đúng yêu cầu của đề bài.',
        'Task 1: cần có overview rõ, chọn đúng key features và trích số liệu chính xác thay vì liệt kê máy móc.',
        'Task 2: cần trả lời đủ các phần của đề, giữ lập trường rõ ràng và phát triển luận điểm bằng giải thích hoặc ví dụ cụ thể.',
    ],
    'Coherence and Cohesion': [
        'Đánh giá độ mạch lạc của ý tưởng và tính liên kết trong toàn bài.',
        'Bài viết cần được sắp xếp logic, chia đoạn hợp lý, mỗi đoạn có trọng tâm rõ để người đọc theo dõi dễ dàng.',
        'Từ nối, đại từ thay thế và các liên kết câu phải tự nhiên, không lạm dụng hoặc làm người đọc bị rối.',
    ],
    'Lexical Resource': [
        'Đánh giá độ đa dạng và độ chính xác của vốn từ vựng.',
        'Bạn cần paraphrase tốt, dùng từ đúng ngữ cảnh và dùng collocation tự nhiên thay vì chỉ cố nhét từ khó.',
        'Lỗi chính tả, word form hoặc dùng từ sai sắc thái sẽ kéo điểm tiêu chí này xuống.',
    ],
    'Grammatical Range and Accuracy': [
        'Đánh giá sự đa dạng và độ chính xác của cấu trúc ngữ pháp.',
        'Bài viết tốt cần phối hợp câu đơn, câu ghép và câu phức thay vì chỉ dùng một kiểu câu lặp lại.',
        'Giám khảo nhìn vào tỷ lệ câu không lỗi và mức độ nghiêm trọng của lỗi để quyết định band của tiêu chí này.',
    ],
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
    writingCriteria.map((criteria) => (
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
    writingCriteria.map((criteria) => {
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
