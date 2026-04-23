import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Col,
    Empty,
    Row,
    Space,
    Statistic,
    Tag,
    Typography,
    message,
} from 'antd';
import { ArrowLeftOutlined, BulbOutlined, ReloadOutlined, SendOutlined } from '@ant-design/icons';
import { createPortal } from 'react-dom';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { streamCopilotChat } from '../api/copilot.api';
import { usePracticeSessionQuery, useStartPracticeSessionMutation, useSubmitReadingListeningMutation, useSubmitWritingMutation } from '../api/session.api';
import { ReviewCopilotDrawer } from '../components/ReviewCopilotDrawer';
import { ListeningAttemptModeModal } from '../components/ListeningAttemptModeModal';
import {
    buildListeningQuestionFocusPayload,
    buildObjectiveReviewCopilotContext,
    buildQuestionFocusPayload,
    buildWritingReviewCopilotContext,
    buildWritingTaskFocusPayload,
    findListeningQuestionFocusPayload,
    inferListeningQuestionEvidenceMatch,
} from '../lib/reviewCopilotContext';
import { setListeningAttemptMode, type ListeningAttemptMode } from '../lib/listeningSessionState';
import { getSessionRunnerPath, getSkillLabel, isObjectiveSkill, isSupportedRunnerSkill, isWritingSkill } from '../lib/sessionRouting';
import {
    findListeningReplayMatch,
    findListeningTranscriptSnippetByTime,
    formatTranscriptRangeLabel,
    inferCopilotReplayMatchFromText,
    parseListeningTranscriptEnvelope,
} from '@/shared/lib/listeningTranscript';
import { formatDateTimeToMinute } from '@/shared/lib/dateTime';
import { extractWritingTaskImageUrls } from '@/shared/lib/writingTaskAssets';
import type { CopilotChatMessage, CopilotContextImagePayload, CopilotFocusPayload, CopilotReplayAction, ReviewCopilotContext } from '../types/copilot.types';
import type {
    PracticeSessionAnswerDto,
    PracticeSessionDto,
    PracticeSessionFeedbackDto,
    PracticeSessionListeningPartDto,
    PracticeSessionQuestionDto,
    PracticeSessionQuestionGroupDto,
} from '../types/session.types';
import { ListeningBody, ReadingBody } from './ClientObjectiveSessionRunnerPage';

const { Title, Paragraph, Text } = Typography;

const statusColorMap: Record<string, string> = {
    NotStarted: 'default',
    InProgress: 'processing',
    Submitted: 'warning',
    Completed: 'success',
    Abandoned: 'error',
};

const statusLabelMap: Record<string, string> = {
    NotStarted: 'Chưa bắt đầu',
    InProgress: 'Đang làm bài',
    Submitted: 'Đã nộp',
    Completed: 'Hoàn thành',
    Abandoned: 'Đã hủy',
};

const LISTENING_REPLAY_PREROLL_SECONDS = 10;
const LISTENING_REPLAY_POSTROLL_SECONDS = 5;

const formatSeconds = (value?: number | null) => {
    if (value == null) {
        return 'Khong gioi han';
    }

    const total = Math.max(0, value);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const getSessionStatusLabel = (status?: string | null) => (
    status ? statusLabelMap[status] ?? status : 'N/A'
);

const WRITING_SUBMIT_MIN_WORDS = 10;
const CLIENT_LAYOUT_CONTENT_GUTTER = 24;

const countWords = (value?: string | null) => {
    const trimmed = (value ?? '').trim();
    if (!trimmed) {
        return 0;
    }

    return trimmed.split(/\s+/).filter(Boolean).length;
};

const getWritingTasks = (session?: PracticeSessionDto | null) => (
    session?.exam.sections
        .filter((section) => section.skillType.trim().toUpperCase() === 'WRITING')
        .flatMap((section) => section.writingTasks)
        .sort((left, right) => (left.taskNumber ?? 0) - (right.taskNumber ?? 0)) ?? []
);

const getWritingAnswerMap = (session?: PracticeSessionDto | null) => (
    (session?.answers ?? []).reduce<Record<string, string>>((accumulator, answer) => {
        if (answer.writingTaskId && answer.answerText) {
            accumulator[answer.writingTaskId] = answer.answerText;
        }
        return accumulator;
    }, {})
);

const getWritingReviewAnswerMap = (session?: PracticeSessionDto | null) => (
    (session?.answers ?? []).reduce<Record<string, PracticeSessionAnswerDto | undefined>>((accumulator, answer) => {
        if (answer.writingTaskId) {
            accumulator[answer.writingTaskId] = answer;
        }

        return accumulator;
    }, {})
);

const parseWritingAssets = (assetsData?: string | null) => {
    return extractWritingTaskImageUrls(assetsData);
};

const getInvalidWritingTaskNumbers = (session?: PracticeSessionDto | null) => {
    const answerMap = getWritingAnswerMap(session);
    return getWritingTasks(session)
        .filter((task) => countWords(answerMap[task.id]) < WRITING_SUBMIT_MIN_WORDS)
        .map((task, index) => task.taskNumber ?? index + 1);
};

const buildObjectiveAnswerMap = (session: PracticeSessionDto) => (
    session.answers.reduce<Record<string, string>>((accumulator, answer) => {
        if (answer.questionId) {
            accumulator[answer.questionId] = answer.answerText ?? '';
        }
        return accumulator;
    }, {})
);

const buildObjectiveReviewAnswerMap = (session: PracticeSessionDto) => (
    session.answers.reduce<Record<string, PracticeSessionDto['answers'][number]>>((accumulator, answer) => {
        if (answer.questionId) {
            accumulator[answer.questionId] = answer;
        }
        return accumulator;
    }, {})
);

const writingCriteria = [
    'Task Achievement/Response',
    'Coherence and Cohesion',
    'Lexical Resource',
    'Grammatical Range and Accuracy',
];

const writingCriteriaLabels: Record<string, string> = {
    'Task Achievement/Response': 'TA/TR',
    'Coherence and Cohesion': 'CC',
    'Lexical Resource': 'LR',
    'Grammatical Range and Accuracy': 'GRA',
};

const writingCriteriaGuideMap: Record<string, string[]> = {
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

const roundIeltsBand = (value: number) => Math.round(Math.max(0, Math.min(9, value)) * 2) / 2;

const getWritingFeedbacks = (session?: PracticeSessionDto | null) => (
    (session?.answers ?? [])
        .filter((answer) => answer.writingTaskId)
        .flatMap((answer) => answer.feedbacks ?? [])
);

const matchWritingFeedbackCriteria = (feedbacks: PracticeSessionFeedbackDto[], criteria: string) => (
    feedbacks.find((feedback) => feedback.criteria === criteria)
    ?? feedbacks.find((feedback) => feedback.criteria.toLowerCase().includes(criteria.toLowerCase().split(' ')[0]))
);

const orderWritingFeedbacksByCriteria = (feedbacks: PracticeSessionFeedbackDto[]) => (
    writingCriteria.map((criteria) => (
        matchWritingFeedbackCriteria(feedbacks, criteria)
        ?? { criteria, bandScore: 0, comment: null, improvements: null }
    ))
);

const calculateFeedbackAverageBand = (feedbacks: PracticeSessionFeedbackDto[]) => {
    const validFeedbacks = feedbacks.filter((feedback) => feedback.bandScore > 0);
    if (validFeedbacks.length === 0) {
        return null;
    }

    return roundIeltsBand(validFeedbacks.reduce((total, feedback) => total + feedback.bandScore, 0) / validFeedbacks.length);
};

const getWeightedWritingFeedbackByCriteria = (session?: PracticeSessionDto | null): PracticeSessionFeedbackDto[] => (
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

const getWritingTaskChartData = (session?: PracticeSessionDto | null) => (
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

const getWritingTaskFeedbackSections = (session?: PracticeSessionDto | null) => (
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

const createCopilotMessageId = (prefix: 'user' | 'model') =>
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const mergeCopilotImages = (...groups: Array<CopilotContextImagePayload[] | null | undefined>) => {
    const merged = groups.flatMap((items) => items ?? []);
    const seen = new Set<string>();

    return merged.filter((item) => {
        const normalizedUrl = item.url.trim();
        if (!normalizedUrl || seen.has(normalizedUrl)) {
            return false;
        }

        seen.add(normalizedUrl);
        return true;
    });
};

const dedupeCopilotFocuses = (focuses: CopilotFocusPayload[]) => {
    const seen = new Set<string>();

    return focuses.filter((focus) => {
        const key = focus.questionNumber != null ? `q-${focus.questionNumber}` : focus.label.trim().toLowerCase();
        if (!key || seen.has(key)) {
            return false;
        }

        seen.add(key);
        return true;
    });
};

const buildCopilotOutgoingMessage = (message: string, context: ReviewCopilotContext) => {
    const trimmedMessage = message.trim();
    const prefixes: string[] = [];

    if (context.currentFocusLabel && context.currentFocusText) {
        prefixes.push(
            [
                `Ưu tiên trả lời theo focus hiện tại: ${context.currentFocusLabel}.`,
                'Nếu câu hỏi của tôi mơ hồ, hãy hiểu là tôi đang hỏi đúng phần focus này trước.',
            ].join(' '),
        );
    }

    if (isObjectiveSkill(context.skillType) && context.focusedQuestionNumber != null) {
        prefixes.push(
            [
                'Với câu objective đang focus, không được chỉ trả lời bằng một chữ cái, một từ hoặc ký hiệu đáp án trần.',
                'Hãy nêu đáp án trước, rồi giải thích ngắn vì sao đáp án đó đúng dựa trên dữ kiện trong bài review.',
            ].join(' '),
        );
    }

    if (context.skillType.trim().toUpperCase() === 'LISTENING' && context.focusedQuestionNumber != null) {
        prefixes.push(
            [
                'Nếu đây là câu Listening, hãy dùng transcript window của đúng câu đang focus.',
                'Với map labelling hoặc matching, phải chỉ ra chi tiết định vị hoặc câu tiếng Anh làm bằng chứng, không chỉ nêu mỗi ký hiệu như F hay G.',
            ].join(' '),
        );
    }

    if (context.selectedText?.trim()) {
        prefixes.push('Nếu có đoạn tôi vừa bôi đen thì hãy ưu tiên dùng đoạn đó cùng với focus hiện tại.');
    }

    return prefixes.length > 0
        ? `${prefixes.join('\n')}\n\nCâu hỏi của tôi: ${trimmedMessage}`
        : trimmedMessage;
};

const getSharedListeningReviewAudioUrl = (parts: PracticeSessionListeningPartDto[] = []) => (
    parts
        .map((part) => (part.audioUrl ?? '').trim())
        .find((audioUrl) => audioUrl.length > 0)
    ?? ''
);

const normalizeCopilotIntentText = (value: string) => (
    value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
);

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
        const rightOrder = right.endQuestion ?? Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder || left.id.localeCompare(right.id);
    })
);

const listeningQuestionNumberWordValues: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    twenty: 20,
    thirty: 30,
    forty: 40,
};

const listeningQuestionNumberTokenPattern = [
    '\\d+',
    'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
    'twenty(?:\\s+(?:one|two|three|four|five|six|seven|eight|nine))?',
    'thirty(?:\\s+(?:one|two|three|four|five|six|seven|eight|nine))?',
    'forty',
].join('|');

const parseListeningQuestionNumberToken = (token: string) => {
    const normalized = token.trim().replace(/\s+/g, ' ');
    const numericValue = Number(normalized);
    if (Number.isFinite(numericValue)) {
        return numericValue;
    }

    if (listeningQuestionNumberWordValues[normalized] != null) {
        return listeningQuestionNumberWordValues[normalized];
    }

    const compoundMatch = normalized.match(/^(twenty|thirty|forty)\s+(one|two|three|four|five|six|seven|eight|nine)$/);
    if (!compoundMatch) {
        return null;
    }

    return listeningQuestionNumberWordValues[compoundMatch[1]] + listeningQuestionNumberWordValues[compoundMatch[2]];
};

const parseQuestionRangeFromListeningTranscriptSegment = (value?: string | null) => {
    const normalized = normalizeCopilotIntentText(value ?? '')
        .replace(/([a-z])[-–—]([a-z])/g, '$1 $2')
        .replace(/(\d)\s*[-–—]\s*(\d)/g, '$1 - $2')
        .replace(/\s+/g, ' ')
        .trim();
    if (!normalized) {
        return null;
    }

    const match = normalized.match(new RegExp(`\\bquestions?\\s+(${listeningQuestionNumberTokenPattern})\\s*(?:to|-|through)\\s*(${listeningQuestionNumberTokenPattern})\\b`));
    if (!match) {
        return null;
    }

    const startQuestion = parseListeningQuestionNumberToken(match[1]);
    const endQuestion = parseListeningQuestionNumberToken(match[2]);
    if (!Number.isFinite(startQuestion) || !Number.isFinite(endQuestion) || startQuestion > endQuestion) {
        return null;
    }

    return { startQuestion, endQuestion };
};

const detectListeningReplayScopes = (segments: Array<{ text: string }>) => {
    const events: Array<{ segmentIndex: number; startQuestion: number; endQuestion: number }> = [];

    segments.forEach((segment, index) => {
        const questionRange = parseQuestionRangeFromListeningTranscriptSegment(segment.text);
        if (!questionRange) {
            return;
        }

        const previousEvent = events[events.length - 1];
        if (previousEvent
            && previousEvent.startQuestion === questionRange.startQuestion
            && previousEvent.endQuestion === questionRange.endQuestion) {
            events[events.length - 1] = {
                segmentIndex: index,
                startQuestion: questionRange.startQuestion,
                endQuestion: questionRange.endQuestion,
            };
            return;
        }

        events.push({
            segmentIndex: index,
            startQuestion: questionRange.startQuestion,
            endQuestion: questionRange.endQuestion,
        });
    });

    return events.map((event, index) => {
        const nextEvent = events[index + 1];
        return {
            startQuestion: event.startQuestion,
            endQuestion: event.endQuestion,
            startSegmentIndex: Math.min(event.segmentIndex + 1, Math.max(segments.length - 1, 0)),
            endSegmentIndex: nextEvent
                ? Math.max(event.segmentIndex + 1, nextEvent.segmentIndex - 1)
                : Math.max(segments.length - 1, 0),
        };
    });
};

const findListeningReplayScopeForQuestion = (
    segments: Array<{ text: string }>,
    questionNumber?: number | null,
) => {
    if (questionNumber == null || segments.length === 0) {
        return null;
    }

    return detectListeningReplayScopes(segments)
        .find((scope) => scope.startQuestion <= questionNumber && questionNumber <= scope.endQuestion) ?? null;
};

const selectListeningReplayScopeSegments = <T,>({
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

const buildListeningScopeReplayMatch = (
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

const summarizeAnswerValue = (value?: string | null) => {
    const trimmed = (value ?? '').trim();
    return trimmed || 'Chưa trả lời';
};

const isObjectiveWeaknessSummaryIntent = (message: string, skillType: string) => {
    const normalizedMessage = normalizeCopilotIntentText(message);
    const hasSummaryIntent = normalizedMessage.includes('tom tat')
        || normalizedMessage.includes('tong hop')
        || normalizedMessage.includes('liet ke');
    const hasWeaknessIntent = normalizedMessage.includes('chua tot')
        || normalizedMessage.includes('lam sai')
        || normalizedMessage.includes('cau sai')
        || normalizedMessage.includes('phan sai')
        || normalizedMessage.includes('loi sai')
        || normalizedMessage.includes('diem yeu');
    const hasSkillHint = skillType === 'LISTENING'
        ? normalizedMessage.includes('phan nghe') || normalizedMessage.includes('listening')
        : normalizedMessage.includes('phan doc') || normalizedMessage.includes('reading');

    return hasSummaryIntent && (hasWeaknessIntent || hasSkillHint);
};

const buildObjectiveWeaknessSummary = ({
    skillType,
    readingPassages,
    listeningParts,
    answerMap,
    reviewAnswerMap,
}: {
    skillType: string;
    readingPassages: PracticeSessionDto['exam']['sections'][number]['readingPassages'];
    listeningParts: PracticeSessionListeningPartDto[];
    answerMap: Record<string, string>;
    reviewAnswerMap: Record<string, PracticeSessionAnswerDto | undefined>;
}) => {
    const containers = skillType === 'READING'
        ? readingPassages.map((passage, index) => ({
            label: `Passage ${passage.passageNumber ?? index + 1}`,
            questions: sortObjectiveGroups(passage.questionGroups).flatMap((group) => sortObjectiveQuestions(group.questions)),
        }))
        : listeningParts.map((part, index) => ({
            label: `Part ${part.partNumber ?? index + 1}`,
            questions: sortObjectiveGroups(part.questionGroups).flatMap((group) => sortObjectiveQuestions(group.questions)),
        }));

    const partLines = containers.map((container) => {
        const wrongEntries = container.questions.flatMap((question) => {
            const reviewAnswer = reviewAnswerMap[question.id];
            if (reviewAnswer?.isCorrect !== false) {
                return [];
            }

            return [{
                questionNumber: question.questionNumber,
                userAnswer: summarizeAnswerValue(answerMap[question.id] ?? reviewAnswer.answerText),
                correctAnswer: summarizeAnswerValue(reviewAnswer.correctAnswer ?? question.correctAnswer),
            }];
        });

        if (wrongEntries.length === 0) {
            return `**${container.label}:** Không có câu sai.`;
        }

        const entryText = wrongEntries.map((entry) => (
            `câu ${entry.questionNumber ?? 'N/A'} (${entry.userAnswer} -> ${entry.correctAnswer})`
        )).join('; ');

        return `**${container.label}:** Sai ${wrongEntries.length} câu: ${entryText}.`;
    });

    const totalWrong = containers.reduce((total, container) => (
        total + container.questions.filter((question) => reviewAnswerMap[question.id]?.isCorrect === false).length
    ), 0);

    return [
        `Mình đã tổng hợp toàn bộ câu sai của bài ${skillType === 'LISTENING' ? 'Listening' : 'Reading'} này.`,
        '',
        ...partLines,
        '',
        `**Tổng cộng:** ${totalWrong} câu sai.`,
    ].join('\n');
};

const hasListeningReplayIntent = (message: string) => {
    const normalizedMessage = normalizeCopilotIntentText(message);
    const keywordMatches = [
        'nghe lai',
        'phat lai',
        'play',
        'replay',
        'timestamp',
        'tapescript',
        'transcript',
        'o dau',
        'phut',
        'giay',
        'audio',
        'doan',
        'tua',
    ].some((keyword) => normalizedMessage.includes(keyword));

    if (keywordMatches) {
        return true;
    }

    return [
        /\bnghe\s+(?:o\s+)?dau\b/i,
        /\bnghe\s+doan\s+nao\b/i,
        /\bnghe\s+khuc\s+nao\b/i,
        /\btra\s+loi\s+(?:duoc\s+)?(?:o\s+)?dau\b/i,
        /\bnam\s+(?:o\s+)?dau\b/i,
        /\bkhuc\s+nao\b/i,
        /\bdoan\s+nao\b/i,
        /\bcho\s+nao\b/i,
    ].some((pattern) => pattern.test(normalizedMessage));
};

const extractRequestedReplayQuestionNumber = (message: string, focusedQuestionNumber?: number | null) => {
    const normalizedMessage = normalizeCopilotIntentText(message);
    const explicitMatch = normalizedMessage.match(/(?:cau|question|q)\s*(\d{1,3})/i);
    if (explicitMatch) {
        const parsed = Number(explicitMatch[1]);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }

    if (focusedQuestionNumber != null && /\b(cau nay|question nay|question this|this question|q nay)\b/i.test(normalizedMessage)) {
        return focusedQuestionNumber;
    }

    return hasListeningReplayIntent(message) ? focusedQuestionNumber ?? null : null;
};

const extractReferencedQuestionNumber = (message: string, focusedQuestionNumber?: number | null) => {
    const normalizedMessage = normalizeCopilotIntentText(message);
    const explicitMatch = normalizedMessage.match(/(?:cau|question|q)\s*(\d{1,3})/i);
    if (explicitMatch) {
        const parsed = Number(explicitMatch[1]);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }

    if (focusedQuestionNumber != null && /\b(cau nay|question nay|question this|this question|q nay)\b/i.test(normalizedMessage)) {
        return focusedQuestionNumber;
    }

    return null;
};

const isAmbiguousListeningReplayRequest = (message: string, focusedQuestionNumber?: number | null) => {
    if (!hasListeningReplayIntent(message)) {
        return false;
    }

    return extractRequestedReplayQuestionNumber(message, focusedQuestionNumber) == null;
};

const buildListeningReplayLookup = ({
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

    const replayAction = buildListeningReplayActionForQuestion({
        parts,
        activePartIndex,
        questionNumber,
        reviewAnswerMap,
    });

    if (!replayAction) {
        return null;
    }

    return replayAction;
};

const buildListeningReplayActionForQuestion = ({
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
        const inferredReplayMatch = locatedGroup && locatedQuestion
            ? inferListeningQuestionEvidenceMatch({
                segments: transcriptSegments,
                group: locatedGroup,
                question: {
                    ...locatedQuestion,
                    correctAnswer: reviewAnswerMap?.[locatedQuestion.id]?.correctAnswer || locatedQuestion.correctAnswer,
                },
            })
            : null;

        const audioUrl = (part.audioUrl ?? '').trim();
        if (!audioUrl) {
            continue;
        }

        const preferredReplayMatch = inferredReplayMatch ?? replayMatch;

        if (preferredReplayMatch) {
            return createListeningReplayAction({
                audioUrl,
                answerStartSecond: preferredReplayMatch.startTime,
                answerEndSecond: preferredReplayMatch.endTime,
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
                transcriptSnippet: scopeReplayMatch.text,
                questionNumber,
                matchType: 'scope',
            });
        }
    }

    return null;
};

const createListeningReplayAction = ({
    audioUrl,
    answerStartSecond,
    answerEndSecond,
    transcriptSnippet,
    questionNumber,
    matchType = 'exact',
}: {
    audioUrl: string;
    answerStartSecond: number;
    answerEndSecond?: number | null;
    transcriptSnippet?: string | null;
    questionNumber?: number | null;
    matchType?: 'exact' | 'scope';
}): CopilotReplayAction => {
    const playAtSecond = Math.max(0, answerStartSecond - LISTENING_REPLAY_PREROLL_SECONDS);
    const replayEndSecond = answerEndSecond != null
        ? answerEndSecond + LISTENING_REPLAY_POSTROLL_SECONDS
        : null;
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

const resolveListeningTranscriptSnippetForReplay = ({
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

const isNodeInsideCopilotDrawer = (node: Node | null) => {
    const element = node instanceof Element ? node : node?.parentElement ?? null;
    return !!element?.closest('[data-copilot-drawer-root="true"]');
};

const readSelectedReviewText = () => {
    if (typeof window === 'undefined') {
        return '';
    }

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
        return '';
    }

    if (isNodeInsideCopilotDrawer(selection.anchorNode) || isNodeInsideCopilotDrawer(selection.focusNode)) {
        return '';
    }

    return selection.toString().replace(/[ \t]+\n/g, '\n').trim();
};

const selectionKeywordStopwords = new Set([
    'the', 'and', 'that', 'this', 'with', 'from', 'into', 'your', 'their', 'there', 'about', 'would', 'could',
    'should', 'have', 'has', 'had', 'were', 'was', 'been', 'being', 'while', 'where', 'when', 'which', 'what',
    'why', 'then', 'than', 'them', 'they', 'those', 'these', 'just', 'also', 'only', 'more', 'most', 'very',
    'much', 'many', 'some', 'such', 'over', 'under', 'after', 'before', 'because', 'through', 'during', 'between',
    'each', 'other', 'another', 'into', 'onto', 'upon', 'across', 'around', 'within', 'without', 'against', 'among',
    'people', 'person', 'writer', 'passage', 'question', 'answer', 'student', 'selected', 'choose',
    'mình', 'bạn', 'đang', 'đoạn', 'chọn', 'này', 'kia', 'được', 'trong', 'ngoài', 'cũng', 'nhưng', 'hoặc', 'với',
    'của', 'cho', 'nên', 'rằng', 'đây', 'đó', 'khi', 'nếu', 'thì', 'để', 'một', 'những', 'các',
]);

const extractSelectionKeywords = (selectedText: string) => {
    const tokens = selectedText
        .toLowerCase()
        .match(/[a-zA-ZÀ-ỹ0-9]+/g) ?? [];

    const frequency = new Map<string, { count: number; firstIndex: number }>();

    tokens.forEach((token, index) => {
        if (token.length < 4 || selectionKeywordStopwords.has(token)) {
            return;
        }

        const current = frequency.get(token);
        if (!current) {
            frequency.set(token, { count: 1, firstIndex: index });
            return;
        }

        frequency.set(token, {
            count: current.count + 1,
            firstIndex: current.firstIndex,
        });
    });

    return [...frequency.entries()]
        .sort((left, right) => (
            right[1].count - left[1].count
            || left[1].firstIndex - right[1].firstIndex
            || left[0].localeCompare(right[0])
        ))
        .slice(0, 5)
        .map(([token]) => token);
};

const inferListeningQuestionNumberFromContextText = ({
    parts,
    text,
}: {
    parts: PracticeSessionListeningPartDto[];
    text?: string | null;
}) => {
    const normalizedKeywords = Array.from(new Set(
        extractSelectionKeywords(text ?? '')
            .map((keyword) => normalizeCopilotIntentText(keyword))
            .filter((keyword) => keyword.length >= 3),
    ));
    if (normalizedKeywords.length === 0) {
        return null;
    }

    const scores = new Map<number, number>();
    parts.forEach((part) => {
        const transcriptSegments = parseListeningTranscriptEnvelope(part.transcriptData).segments;
        transcriptSegments.forEach((segment) => {
            if (segment.targetQuestionNumbers.length === 0) {
                return;
            }

            const normalizedSegmentText = normalizeCopilotIntentText(segment.text);
            const matchedKeywordCount = normalizedKeywords.filter((keyword) => normalizedSegmentText.includes(keyword)).length;
            if (matchedKeywordCount === 0) {
                return;
            }

            segment.targetQuestionNumbers.forEach((questionNumber) => {
                scores.set(questionNumber, (scores.get(questionNumber) ?? 0) + matchedKeywordCount);
            });
        });
    });

    if (scores.size === 0) {
        return null;
    }

    const rankedScores = [...scores.entries()].sort((left, right) => right[1] - left[1] || left[0] - right[0]);
    const [bestQuestionNumber, bestScore] = rankedScores[0];
    const secondScore = rankedScores[1]?.[1] ?? 0;

    if (bestScore < 2 || bestScore === secondScore) {
        return null;
    }

    return bestQuestionNumber;
};

const ObjectiveSessionReviewRunner = ({
    session,
    onCopilotLayoutChange,
}: {
    session: PracticeSessionDto;
    onCopilotLayoutChange?: (state: { open: boolean; reservedWidth: number }) => void;
}) => {
    const skillType = session.skillType.trim().toUpperCase();
    const [activeItemIndex, setActiveItemIndex] = useState(0);
    const [copilotOpen, setCopilotOpen] = useState(false);
    const [copilotPrepared, setCopilotPrepared] = useState(false);
    const [copilotLoadingContext, setCopilotLoadingContext] = useState(false);
    const [copilotErrorMessage, setCopilotErrorMessage] = useState<string | null>(null);
    const [copilotDraftMessage, setCopilotDraftMessage] = useState('');
    const [copilotMessages, setCopilotMessages] = useState<CopilotChatMessage[]>([]);
    const [copilotSelectedText, setCopilotSelectedText] = useState('');
    const [copilotFocuses, setCopilotFocuses] = useState<CopilotFocusPayload[]>([]);
    const [copilotComposerFocusSignal, setCopilotComposerFocusSignal] = useState(0);
    const [copilotStreamingMessageId, setCopilotStreamingMessageId] = useState<string | null>(null);
    const [copilotReservedWidth, setCopilotReservedWidth] = useState(0);
    const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
    const copilotAbortRef = useRef<AbortController | null>(null);
    const copilotPreparationTimeoutRef = useRef<number | null>(null);
    const reviewListeningAudioRef = useRef<HTMLAudioElement | null>(null);
    const replayStopAtRef = useRef<number | null>(null);

    const sections = useMemo(
        () => session.exam.sections.filter((section) => section.skillType.trim().toUpperCase() === skillType),
        [session.exam.sections, skillType],
    );

    const readingPassages = useMemo(
        () => sections.flatMap((section) => section.readingPassages),
        [sections],
    );

    const listeningParts = useMemo(
        () => sections.flatMap((section) => section.listeningParts),
        [sections],
    );
    const sharedListeningAudioUrl = useMemo(
        () => getSharedListeningReviewAudioUrl(listeningParts),
        [listeningParts],
    );

    const navigationItems = skillType === 'READING' ? readingPassages : listeningParts;
    const answerMap = useMemo(() => buildObjectiveAnswerMap(session), [session]);
    const reviewAnswerMap = useMemo(() => buildObjectiveReviewAnswerMap(session), [session]);
    const baseCopilotContext = useMemo(
        () => buildObjectiveReviewCopilotContext({
            session,
            activeItemIndex,
            answerMap,
            reviewAnswerMap,
        }),
        [session, activeItemIndex, answerMap, reviewAnswerMap],
    );
    const focusSummaryLabel = useMemo(
        () => (copilotFocuses.length > 0 ? copilotFocuses.map((focus) => focus.label).join(', ') : null),
        [copilotFocuses],
    );
    const focusSummaryText = useMemo(
        () => (
            copilotFocuses.length > 0
                ? copilotFocuses.map((focus) => `=== ${focus.label} ===\n${focus.text}`).join('\n\n')
                : null
        ),
        [copilotFocuses],
    );
    const copilotContext = useMemo<ReviewCopilotContext>(
        () => ({
            ...baseCopilotContext,
            currentFocusLabel: focusSummaryLabel,
            currentFocusText: focusSummaryText,
            focusedQuestionNumber: copilotFocuses.length === 1 ? copilotFocuses[0].questionNumber ?? null : null,
            selectedText: copilotSelectedText || null,
            selectedTextLabel: copilotSelectedText ? 'Từ khóa trích đoạn' : null,
            contextImages: mergeCopilotImages(baseCopilotContext.contextImages, ...copilotFocuses.map((focus) => focus.images)),
        }),
        [baseCopilotContext, focusSummaryLabel, focusSummaryText, copilotFocuses, copilotSelectedText],
    );
    const copilotSelectionChipLabel = useMemo(
        () => extractSelectionKeywords(copilotSelectedText).join(', ') || 'trích đoạn đã chọn',
        [copilotSelectedText],
    );

    useEffect(() => {
        if (skillType !== 'LISTENING') {
            replayStopAtRef.current = null;
            return;
        }

        const audioElement = reviewListeningAudioRef.current;
        if (!audioElement) {
            return;
        }

        const handleTimeUpdate = () => {
            const stopAtSecond = replayStopAtRef.current;
            if (stopAtSecond == null || audioElement.currentTime < stopAtSecond) {
                return;
            }

            replayStopAtRef.current = null;
            audioElement.pause();
        };

        audioElement.addEventListener('timeupdate', handleTimeUpdate);
        return () => audioElement.removeEventListener('timeupdate', handleTimeUpdate);
    }, [headerSlot, sharedListeningAudioUrl, skillType]);

    useEffect(() => {
        setActiveItemIndex((current) => {
            if (navigationItems.length === 0) {
                return 0;
            }

            return Math.min(current, navigationItems.length - 1);
        });
    }, [navigationItems.length]);

    useEffect(() => {
        setCopilotOpen(false);
        setCopilotPrepared(false);
        setCopilotLoadingContext(false);
        setCopilotErrorMessage(null);
        setCopilotDraftMessage('');
        setCopilotMessages([]);
        setCopilotSelectedText('');
        setCopilotFocuses([]);
        setCopilotStreamingMessageId(null);
        setCopilotReservedWidth(0);
        copilotAbortRef.current?.abort();
        if (copilotPreparationTimeoutRef.current != null) {
            window.clearTimeout(copilotPreparationTimeoutRef.current);
            copilotPreparationTimeoutRef.current = null;
        }
    }, [session.sessionId]);

    useEffect(() => () => {
        copilotAbortRef.current?.abort();
        if (copilotPreparationTimeoutRef.current != null) {
            window.clearTimeout(copilotPreparationTimeoutRef.current);
        }
    }, []);

    useEffect(() => {
        setHeaderSlot(document.getElementById('client-page-header-slot'));
    }, []);

    useEffect(() => {
        onCopilotLayoutChange?.({
            open: copilotOpen,
            reservedWidth: copilotOpen ? copilotReservedWidth : 0,
        });
    }, [copilotOpen, copilotReservedWidth, onCopilotLayoutChange]);

    const updateCopilotMessages = (updater: (messages: CopilotChatMessage[]) => CopilotChatMessage[]) => {
        setCopilotMessages((current) => updater(current));
    };

    const stopCopilotStream = () => {
        copilotAbortRef.current?.abort();
        copilotAbortRef.current = null;
        setCopilotStreamingMessageId(null);
    };

    const handlePlayReplayAction = (action: CopilotReplayAction) => {
        const audioElement = reviewListeningAudioRef.current;
        if (!audioElement) {
            message.warning('Audio review chưa sẵn sàng để phát lại.');
            return;
        }

        const seekAndPlay = () => {
            replayStopAtRef.current = action.endAtSecond != null && action.endAtSecond > action.playAtSecond
                ? action.endAtSecond + 0.05
                : null;
            audioElement.currentTime = Math.max(0, action.playAtSecond);

            const playPromise = audioElement.play();
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch(() => {
                    message.warning('Trình duyệt chặn tự phát audio. Bạn bấm "Nghe lại đoạn này" thêm một lần để phát.');
                });
            }
        };

        if (audioElement.readyState >= 1) {
            seekAndPlay();
            return;
        }

        const handleLoadedMetadata = () => {
            audioElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
            seekAndPlay();
        };

        audioElement.addEventListener('loadedmetadata', handleLoadedMetadata);
        audioElement.load();
    };

    const prepareCopilotIfNeeded = () => {
        if (copilotPreparationTimeoutRef.current != null) {
            window.clearTimeout(copilotPreparationTimeoutRef.current);
            copilotPreparationTimeoutRef.current = null;
        }

        if (copilotPrepared) {
            setCopilotLoadingContext(false);
            return;
        }

        setCopilotLoadingContext(true);
        copilotPreparationTimeoutRef.current = window.setTimeout(() => {
            setCopilotPrepared(true);
            setCopilotLoadingContext(false);
            copilotPreparationTimeoutRef.current = null;
        }, 520);
    };

    const openCopilot = (focus?: CopilotFocusPayload | null) => {
        setCopilotErrorMessage(null);
        setCopilotOpen(true);
        if (focus) {
            setCopilotFocuses([focus]);
        }
        prepareCopilotIfNeeded();
        setCopilotComposerFocusSignal((current) => current + 1);
    };

    const handleCloseCopilot = () => {
        stopCopilotStream();
        if (copilotPreparationTimeoutRef.current != null) {
            window.clearTimeout(copilotPreparationTimeoutRef.current);
            copilotPreparationTimeoutRef.current = null;
        }
        setCopilotLoadingContext(false);
        setCopilotErrorMessage(null);
        setCopilotOpen(false);
    };

    useEffect(() => {
        const handleInsertSelectionShortcut = (event: KeyboardEvent) => {
            if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'l') {
                return;
            }

            const nextSelectedText = readSelectedReviewText();
            if (!nextSelectedText) {
                return;
            }

            event.preventDefault();
            setCopilotSelectedText(nextSelectedText);
            if (!copilotOpen) {
                openCopilot();
                return;
            }
            setCopilotComposerFocusSignal((current) => current + 1);
        };

        window.addEventListener('keydown', handleInsertSelectionShortcut, true);
        return () => window.removeEventListener('keydown', handleInsertSelectionShortcut, true);
    }, [copilotOpen]);

    const handleSendCopilotMessage = async (userMessage: string) => {
        let controller: AbortController | null = null;
        let assistantMessageId: string | null = null;

        try {
            if (!copilotContext || copilotLoadingContext) {
                return;
            }

            if (isObjectiveWeaknessSummaryIntent(userMessage, skillType)) {
                updateCopilotMessages((messages) => [
                    ...messages,
                    {
                        id: createCopilotMessageId('user'),
                        role: 'user',
                        content: userMessage,
                        createdAt: Date.now(),
                        status: 'done',
                    },
                    {
                        id: createCopilotMessageId('model'),
                        role: 'model',
                        content: buildObjectiveWeaknessSummary({
                            skillType,
                            readingPassages,
                            listeningParts,
                            answerMap,
                            reviewAnswerMap,
                        }),
                        createdAt: Date.now(),
                        status: 'done',
                    },
                ]);

                setCopilotDraftMessage('');
                setCopilotErrorMessage(null);
                stopCopilotStream();
                setCopilotFocuses([]);
                return;
            }

            if (skillType === 'LISTENING' && isAmbiguousListeningReplayRequest(userMessage, copilotContext.focusedQuestionNumber)) {
                updateCopilotMessages((messages) => [
                    ...messages,
                    {
                        id: createCopilotMessageId('user'),
                        role: 'user',
                        content: userMessage,
                        createdAt: Date.now(),
                        status: 'done',
                    },
                    {
                        id: createCopilotMessageId('model'),
                        role: 'model',
                        content: 'Mình chưa biết "câu này" là câu nào. Bạn hãy bấm `Hỏi AI Copilot` ngay tại đúng câu đó, hoặc nhập rõ số câu như `câu 1 nghe ở đoạn nào`.',
                        createdAt: Date.now(),
                        status: 'done',
                    },
                ]);

                setCopilotDraftMessage('');
                setCopilotErrorMessage(null);
                stopCopilotStream();
                return;
            }

            const effectiveCopilotContext = skillType === 'LISTENING'
                ? (() => {
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
                })()
                : copilotContext;
            const requestedReplayQuestionNumber = skillType === 'LISTENING'
                ? extractRequestedReplayQuestionNumber(
                    userMessage,
                    effectiveCopilotContext.focusedQuestionNumber,
                )
                : null;
            const localReplayAction = skillType === 'LISTENING'
                ? buildListeningReplayLookup({
                    parts: listeningParts,
                    activePartIndex: activeItemIndex,
                    message: userMessage,
                    focusedQuestionNumber: requestedReplayQuestionNumber ?? effectiveCopilotContext.focusedQuestionNumber,
                    reviewAnswerMap,
                })
                : null;

            const outgoingUserMessage = buildCopilotOutgoingMessage(userMessage, effectiveCopilotContext);
            assistantMessageId = createCopilotMessageId('model');
            const history = copilotMessages
                .filter((item) => item.status !== 'error' && item.content.trim())
                .map(({ role, content }) => ({ role, content }));

            updateCopilotMessages((messages) => [
                ...messages,
                {
                    id: createCopilotMessageId('user'),
                    role: 'user',
                    content: userMessage,
                    createdAt: Date.now(),
                    status: 'done',
                },
                {
                    id: assistantMessageId,
                    role: 'model',
                    content: '',
                    createdAt: Date.now(),
                    status: 'streaming',
                },
            ]);

            setCopilotDraftMessage('');
            setCopilotErrorMessage(null);
            stopCopilotStream();
            setCopilotFocuses([]);

            controller = new AbortController();
            copilotAbortRef.current = controller;
            setCopilotStreamingMessageId(assistantMessageId);

            await streamCopilotChat({
                payload: {
                    context: effectiveCopilotContext,
                    userMessage: outgoingUserMessage,
                    chatHistory: history,
                },
                signal: controller.signal,
                onEvent: (event) => {
                    if (event.event === 'chunk') {
                        const delta = typeof event.data.text === 'string' ? event.data.text : '';
                        if (!delta) {
                            return;
                        }

                        updateCopilotMessages((messages) => (
                            messages.map((messageItem) => (
                                messageItem.id === assistantMessageId
                                    ? { ...messageItem, content: `${messageItem.content}${delta}` }
                                    : messageItem
                            ))
                        ));
                        return;
                    }

                    if (event.event === 'error') {
                        throw new Error(
                            typeof event.data.message === 'string'
                                ? event.data.message
                                : 'Không thể kết nối AI Copilot.',
                        );
                    }
                },
            });

            updateCopilotMessages((messages) => (
                messages.map((messageItem) => (
                    messageItem.id === assistantMessageId
                        ? {
                            ...messageItem,
                            status: 'done',
                            replayAction: (
                                messageItem.replayAction
                                ?? (
                                    skillType === 'LISTENING' && sharedListeningAudioUrl
                                        ? (() => {
                                            const inferredReplay = inferCopilotReplayMatchFromText(messageItem.content);
                                            if (!inferredReplay) {
                                                return localReplayAction;
                                            }

                                            const authoritativeReplayQuestionNumber = requestedReplayQuestionNumber
                                                ?? effectiveCopilotContext.focusedQuestionNumber
                                                ?? null;
                                            const replayQuestionNumber = authoritativeReplayQuestionNumber
                                                ?? inferredReplay.questionNumber
                                                ?? null;
                                            const inferredQuestionMatchesRequest = authoritativeReplayQuestionNumber == null
                                                || inferredReplay.questionNumber == null
                                                || inferredReplay.questionNumber === authoritativeReplayQuestionNumber;

                                            if (inferredReplay.answerStartSecond != null && inferredQuestionMatchesRequest) {
                                                const transcriptSnippet = resolveListeningTranscriptSnippetForReplay({
                                                    parts: listeningParts,
                                                    activePartIndex: activeItemIndex,
                                                    answerStartSecond: inferredReplay.answerStartSecond,
                                                    answerEndSecond: inferredReplay.answerEndSecond,
                                                    questionNumber: replayQuestionNumber,
                                                }) ?? inferredReplay.transcriptSnippet;

                                                return createListeningReplayAction({
                                                    audioUrl: sharedListeningAudioUrl,
                                                    answerStartSecond: inferredReplay.answerStartSecond,
                                                    answerEndSecond: inferredReplay.answerEndSecond,
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
                                        })()
                                        : null
                                )
                            ),
                        }
                        : messageItem
                ))
            ));
        } catch (error) {
            if (controller?.signal.aborted && assistantMessageId) {
                updateCopilotMessages((messages) => (
                    messages.flatMap((messageItem) => {
                        if (messageItem.id !== assistantMessageId) {
                            return [messageItem];
                        }

                        return messageItem.content.trim()
                            ? [{ ...messageItem, status: 'done' as const }]
                            : [];
                    })
                ));
                return;
            }

            const nextErrorMessage = error instanceof Error
                ? error.message
                : 'Không thể kết nối AI Copilot.';

            setCopilotErrorMessage(nextErrorMessage);
            if (assistantMessageId) {
                updateCopilotMessages((messages) => (
                    messages.flatMap((messageItem) => {
                        if (messageItem.id !== assistantMessageId) {
                            return [messageItem];
                        }

                        return messageItem.content.trim()
                            ? [{ ...messageItem, status: 'error' as const }]
                            : [];
                    })
                ));
            }
        } finally {
            if (copilotAbortRef.current === controller) {
                copilotAbortRef.current = null;
            }

            if (assistantMessageId) {
                setCopilotStreamingMessageId((current) => current === assistantMessageId ? null : current);
            }
        }
    };

    const handleNavigationItemChange = (index: number) => {
        setActiveItemIndex(index);
        window.requestAnimationFrame(() => {
            document.getElementById('runner-active-section')?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
            });
        });
    };

    const handleFocusQuestionCopilot = ({
        group,
        question,
        reviewAnswer,
    }: {
        group: PracticeSessionQuestionGroupDto;
        question: PracticeSessionQuestionDto;
        reviewAnswer?: PracticeSessionAnswerDto;
    }) => {
        const nextFocus = skillType === 'LISTENING'
            ? buildListeningQuestionFocusPayload({
                parts: listeningParts,
                group,
                question,
                reviewAnswer,
                userAnswer: answerMap[question.id] ?? reviewAnswer?.answerText,
            })
            : buildQuestionFocusPayload({
                group,
                question,
                reviewAnswer,
                userAnswer: answerMap[question.id] ?? reviewAnswer?.answerText,
            });

        openCopilot(nextFocus);
    };

    const renderQuestionAction = isObjectiveSkill(session.skillType)
        ? ({
            group,
            question,
            reviewAnswer,
            compact,
        }: {
            group: PracticeSessionQuestionGroupDto;
            question: PracticeSessionQuestionDto;
            reviewAnswer?: PracticeSessionAnswerDto;
            compact?: boolean;
        }) => {
            const isActiveQuestion = copilotFocuses.some(
                (focus) => focus.questionNumber != null && focus.questionNumber === question.questionNumber,
            );

            return (
                <Button
                    size="small"
                    type={isActiveQuestion ? 'primary' : 'default'}
                    icon={<SendOutlined />}
                    onClick={() => handleFocusQuestionCopilot({ group, question, reviewAnswer })}
                >
                    {compact ? 'Focus AI' : 'Hỏi AI Copilot'}
                </Button>
            );
        }
        : undefined;
    const reviewListeningAudioNode = skillType === 'LISTENING' && sharedListeningAudioUrl
        ? (
            <div
                style={{
                    minWidth: 0,
                    width: 'clamp(180px, 28vw, 320px)',
                    maxWidth: '100%',
                    flex: '1 1 180px',
                }}
            >
                <audio
                    ref={reviewListeningAudioRef}
                    controls
                    controlsList="nodownload noplaybackrate"
                    preload="auto"
                    src={sharedListeningAudioUrl}
                    style={{
                        width: '100%',
                        maxWidth: '100%',
                        display: 'block',
                    }}
                />
            </div>
        )
        : null;

    if (navigationItems.length === 0) {
        return (
            <Card style={{ borderRadius: 22 }}>
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có dữ liệu đề để xem lại." />
            </Card>
        );
    }

    return (
        <>
            {headerSlot ? createPortal(
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        alignItems: 'center',
                        minWidth: 0,
                        width: '100%',
                        maxWidth: '100%',
                        overflow: 'hidden',
                    }}
                >
                    <Button
                        type="text"
                        onClick={() => (copilotOpen ? handleCloseCopilot() : openCopilot(null))}
                        style={{
                            height: 40,
                            marginLeft: 10,
                            paddingInline: 16,
                            borderRadius: 999,
                            border: copilotOpen ? '1px solid #93c5fd' : '1px solid #dbeafe',
                            background: copilotOpen
                                ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)'
                                : 'linear-gradient(135deg, #ffffff 0%, #f8fbff 100%)',
                            color: '#1d4ed8',
                            fontWeight: 700,
                            boxShadow: copilotOpen
                                ? '0 8px 18px rgba(59, 130, 246, 0.18)'
                                : '0 6px 14px rgba(15, 23, 42, 0.06)',
                            flexShrink: 0,
                            whiteSpace: 'nowrap',
                        }}
                    >
                        <Space size={8}>
                            <BulbOutlined />
                            <span>AI gia sư</span>
                        </Space>
                    </Button>
                </div>,
                headerSlot,
            ) : null}

            <Space direction="vertical" size={16} style={{ width: '100%' }}>
                {reviewListeningAudioNode ? (
                    <div
                        style={{
                            border: '1px solid #dbeafe',
                            borderRadius: 16,
                            padding: 12,
                            background: '#f8fbff',
                        }}
                    >
                        <Space direction="vertical" size={6} style={{ width: '100%' }}>
                            <Text type="secondary">Audio review listening</Text>
                            {reviewListeningAudioNode}
                        </Space>
                    </div>
                ) : null}

                <Card style={{ borderRadius: 22 }}>
                    <Space direction="vertical" size={16} style={{ width: '100%' }}>
                        <div>
                            <Title level={4} style={{ margin: 0 }}>Xem lại bài làm</Title>
                        </div>

                        <div className="runner-review-shell">
                            <style>{`
                            .runner-review-shell .runner-split-layout {
                                display: grid;
                                grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
                                align-items: stretch;
                                height: calc(100vh - 190px);
                                min-height: 560px;
                            }

                            .runner-review-shell .runner-split-pane {
                                min-width: 0;
                                height: 100%;
                                overflow-y: auto;
                                overscroll-behavior: contain;
                                padding-bottom: 18px !important;
                            }

                            .runner-review-shell .runner-split-pane::-webkit-scrollbar {
                                width: 8px;
                            }

                            .runner-review-shell .runner-split-pane::-webkit-scrollbar-track {
                                background: transparent;
                            }

                            .runner-review-shell .runner-split-pane::-webkit-scrollbar-thumb {
                                background: rgba(148, 163, 184, 0.42);
                                border-radius: 999px;
                            }

                            @media (max-width: 1100px) {
                                .runner-review-shell .runner-split-layout {
                                    grid-template-columns: 1fr;
                                    height: auto;
                                }

                                .runner-review-shell .runner-split-pane {
                                    height: auto;
                                    max-height: none !important;
                                    overflow: visible !important;
                                    padding-bottom: 20px !important;
                                }
                            }
                        `}</style>

                            {skillType === 'READING' ? (
                                <ReadingBody
                                    passages={readingPassages}
                                    activePassageIndex={activeItemIndex}
                                    answerMap={answerMap}
                                    reviewAnswerMap={reviewAnswerMap}
                                    readOnly
                                    onAnswerChange={() => undefined}
                                    renderQuestionAction={renderQuestionAction}
                                />
                            ) : (
                                <ListeningBody
                                    parts={listeningParts}
                                    activePartIndex={activeItemIndex}
                                    answerMap={answerMap}
                                    reviewAnswerMap={reviewAnswerMap}
                                    readOnly
                                    onAnswerChange={() => undefined}
                                    renderQuestionAction={renderQuestionAction}
                                />
                            )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                            <Card
                                size="small"
                                bodyStyle={{ padding: 0 }}
                                style={{
                                    width: 'fit-content',
                                    borderRadius: 0,
                                    border: '1px solid #dbeafe',
                                    boxShadow: '0 6px 16px rgba(15, 23, 42, 0.08)',
                                    overflow: 'hidden',
                                }}
                            >
                                <div style={{ display: 'flex' }}>
                                    {navigationItems.map((item, index) => {
                                        const itemNumber = skillType === 'READING'
                                            ? ('passageNumber' in item ? item.passageNumber : index + 1)
                                            : ('partNumber' in item ? item.partNumber : index + 1);
                                        const isActive = index === activeItemIndex;

                                        return (
                                            <Button
                                                key={item.id}
                                                type="text"
                                                onClick={() => handleNavigationItemChange(index)}
                                                style={{
                                                    borderRadius: 0,
                                                    minWidth: 40,
                                                    height: 34,
                                                    paddingInline: 14,
                                                    borderRight: index === navigationItems.length - 1 ? 'none' : '1px solid #e2e8f0',
                                                    background: isActive ? '#111827' : '#fff',
                                                    color: isActive ? '#fff' : '#0f172a',
                                                    fontWeight: 800,
                                                }}
                                            >
                                                {itemNumber ?? index + 1}
                                            </Button>
                                        );
                                    })}
                                </div>
                            </Card>
                        </div>
                    </Space>
                </Card>
            </Space>

            <ReviewCopilotDrawer
                open={copilotOpen}
                loadingContext={copilotLoadingContext}
                context={copilotContext}
                messages={copilotMessages}
                draftMessage={copilotDraftMessage}
                isStreaming={!!copilotStreamingMessageId}
                errorMessage={copilotErrorMessage}
                focusComposerSignal={copilotComposerFocusSignal}
                focusChips={copilotFocuses}
                onClose={handleCloseCopilot}
                onDraftChange={setCopilotDraftMessage}
                onSendMessage={handleSendCopilotMessage}
                onStopStreaming={stopCopilotStream}
                onClearFocus={() => setCopilotFocuses([])}
                onRemoveFocus={(focusToRemove) => setCopilotFocuses((current) => current.filter((focus) => (
                    focus.questionNumber != null && focusToRemove.questionNumber != null
                        ? focus.questionNumber !== focusToRemove.questionNumber
                        : focus.label !== focusToRemove.label
                )))}
                onClearSelection={() => setCopilotSelectedText('')}
                selectionChipLabel={copilotSelectionChipLabel}
                onReservedWidthChange={setCopilotReservedWidth}
                onPlayReplayAction={handlePlayReplayAction}
            />
        </>
    );
};

type WritingCorrection = {
    start_index?: number | null;
    end_index?: number | null;
    original_text?: string | null;
    corrected_text?: string | null;
    explanation?: string | null;
    criteria?: string | null;
};

const parseWritingOverallFeedback = (value?: string | null): { tasks?: Array<{ task_number?: number; feedback?: string; detailed_corrections?: WritingCorrection[] }> } | null => {
    if (!value) {
        return null;
    }

    try {
        return JSON.parse(value) as { tasks?: Array<{ task_number?: number; feedback?: string; detailed_corrections?: WritingCorrection[] }> };
    } catch {
        return null;
    }
};

const WritingRadarChart = ({ feedbacks, compact = false }: { feedbacks: PracticeSessionFeedbackDto[]; compact?: boolean }) => {
    const orderedFeedbacks = feedbacks;
    const size = compact ? 260 : 300;
    const center = size / 2;
    const radius = compact ? 72 : 86;
    const labelRadius = compact ? 106 : 122;
    const labelFontSize = compact ? 10 : 12;
    const valueFontSize = compact ? 10 : 11;
    const levels = [0.25, 0.5, 0.75, 1];
    const points = orderedFeedbacks.map((feedback, index) => {
        const angle = -Math.PI / 2 + (index * 2 * Math.PI) / orderedFeedbacks.length;
        const valueRadius = radius * Math.min(9, Math.max(0, feedback.bandScore)) / 9;
        return {
            x: center + valueRadius * Math.cos(angle),
            y: center + valueRadius * Math.sin(angle),
            labelX: center + labelRadius * Math.cos(angle),
            labelY: center + labelRadius * Math.sin(angle),
            label: writingCriteriaLabels[feedback.criteria] ?? feedback.criteria,
            value: feedback.bandScore,
        };
    });

    const gridPolygons = levels.map((level) => {
        const gridPoints = orderedFeedbacks.map((_, index) => {
            const angle = -Math.PI / 2 + (index * 2 * Math.PI) / orderedFeedbacks.length;
            return `${center + radius * level * Math.cos(angle)},${center + radius * level * Math.sin(angle)}`;
        });
        return gridPoints.join(' ');
    });

    return (
        <div style={{ width: '100%', maxWidth: compact ? 260 : 420, margin: '0 auto' }}>
            <svg width="100%" viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
                {gridPolygons.map((polygon, index) => (
                    <polygon key={polygon} points={polygon} fill="none" stroke={index === gridPolygons.length - 1 ? '#fdba74' : '#fed7aa'} strokeWidth={1} />
                ))}
                {orderedFeedbacks.map((_, index) => {
                    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / orderedFeedbacks.length;
                    return (
                        <line
                            key={index}
                            x1={center}
                            y1={center}
                            x2={center + radius * Math.cos(angle)}
                            y2={center + radius * Math.sin(angle)}
                            stroke="#fed7aa"
                            strokeWidth={1}
                        />
                    );
                })}
                <polygon
                    points={points.map((point) => `${point.x},${point.y}`).join(' ')}
                    fill="rgba(217,119,6,0.24)"
                    stroke="#d97706"
                    strokeWidth={2}
                />
                {points.map((point) => (
                    <g key={point.label}>
                        <circle cx={point.x} cy={point.y} r={4} fill="#d97706" />
                        <text x={point.labelX} y={point.labelY} textAnchor="middle" dominantBaseline="middle" fontSize={labelFontSize} fontWeight={700} fill="#92400e">
                            {point.label}
                        </text>
                        <text x={point.labelX} y={point.labelY + 14} textAnchor="middle" dominantBaseline="middle" fontSize={valueFontSize} fill="#64748b">
                            {point.value.toFixed(1)}
                        </text>
                    </g>
                ))}
            </svg>
        </div>
    );
};

export const ClientSessionSubmitPage = () => {
    const navigate = useNavigate();
    const { sessionId = '' } = useParams();
    const [searchParams] = useSearchParams();
    const autoSubmit = searchParams.get('auto') === '1';
    const autoSubmitTriggeredRef = useRef(false);
    const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
    const [objectiveReviewLayout, setObjectiveReviewLayout] = useState({ open: false, reservedWidth: 0 });
    const [writingCopilotOpen, setWritingCopilotOpen] = useState(false);
    const [writingCopilotPrepared, setWritingCopilotPrepared] = useState(false);
    const [writingCopilotLoadingContext, setWritingCopilotLoadingContext] = useState(false);
    const [writingCopilotErrorMessage, setWritingCopilotErrorMessage] = useState<string | null>(null);
    const [writingCopilotDraftMessage, setWritingCopilotDraftMessage] = useState('');
    const [writingCopilotMessages, setWritingCopilotMessages] = useState<CopilotChatMessage[]>([]);
    const [writingCopilotSelectedText, setWritingCopilotSelectedText] = useState('');
    const [writingCopilotFocuses, setWritingCopilotFocuses] = useState<CopilotFocusPayload[]>([]);
    const [writingCopilotComposerFocusSignal, setWritingCopilotComposerFocusSignal] = useState(0);
    const [writingCopilotStreamingMessageId, setWritingCopilotStreamingMessageId] = useState<string | null>(null);
    const [writingCopilotLayout, setWritingCopilotLayout] = useState({ open: false, reservedWidth: 0 });
    const [pendingListeningRestart, setPendingListeningRestart] = useState(false);
    const writingCopilotAbortRef = useRef<AbortController | null>(null);
    const writingCopilotPreparationTimeoutRef = useRef<number | null>(null);

    const { data: session, isLoading, isError, refetch } = usePracticeSessionQuery(sessionId);
    const submitMutation = useSubmitReadingListeningMutation();
    const submitWritingMutation = useSubmitWritingMutation();
    const startSessionMutation = useStartPracticeSessionMutation();

    useEffect(() => {
        const canAutoSubmitWriting = isWritingSkill(session?.skillType) && session?.status === 'Submitted' && session.result?.writingScore == null;
        if (!autoSubmit || autoSubmitTriggeredRef.current || !session || (!canAutoSubmitWriting && session.status !== 'InProgress') || !isSupportedRunnerSkill(session.skillType)) {
            return;
        }

        autoSubmitTriggeredRef.current = true;
        if (isWritingSkill(session.skillType)) {
            const invalidTasks = getInvalidWritingTaskNumbers(session);
            if (invalidTasks.length > 0) {
                message.warning(`Chưa thể tự động nộp Writing vì Task ${invalidTasks.join(', ')} chưa đủ ${WRITING_SUBMIT_MIN_WORDS} từ.`);
                return;
            }
        }

        const mutation = isWritingSkill(session.skillType) ? submitWritingMutation : submitMutation;
        mutation.mutate(sessionId, {
            onSuccess: () => {
                refetch();
                message.success(isWritingSkill(session.skillType) ? 'Đã nộp bài Writing. AI đang chấm...' : 'Đã tự động nộp bài.');
            },
            onError: (error: any) => {
                refetch();
                const errorMessage = error?.response?.data?.message || 'Không thể nộp/chấm bài. Bạn hãy thử lại.';
                message.error(errorMessage);
            },
        });
    }, [autoSubmit, session, sessionId, refetch, submitMutation, submitWritingMutation]);

    useEffect(() => {
        setHeaderSlot(document.getElementById('client-page-header-slot'));
    }, []);

    const isWritingSession = isWritingSkill(session?.skillType);
    const showObjectiveReview = isObjectiveSkill(session?.skillType) && session?.status === 'Completed';
    const writingReviewAnswerMap = useMemo(() => getWritingReviewAnswerMap(session), [session]);
    const writingCopilotBaseContext = useMemo<ReviewCopilotContext | null>(
        () => (session && isWritingSession ? buildWritingReviewCopilotContext({ session }) : null),
        [session, isWritingSession],
    );
    const writingFocusSummaryLabel = useMemo(
        () => (writingCopilotFocuses.length > 0 ? writingCopilotFocuses.map((focus) => focus.label).join(', ') : null),
        [writingCopilotFocuses],
    );
    const writingFocusSummaryText = useMemo(
        () => (
            writingCopilotFocuses.length > 0
                ? writingCopilotFocuses.map((focus) => `=== ${focus.label} ===\n${focus.text}`).join('\n\n')
                : null
        ),
        [writingCopilotFocuses],
    );
    const writingCopilotContext = useMemo<ReviewCopilotContext | null>(
        () => (
            writingCopilotBaseContext
                ? {
                    ...writingCopilotBaseContext,
                    currentFocusLabel: writingFocusSummaryLabel,
                    currentFocusText: writingFocusSummaryText,
                    focusedQuestionNumber: null,
                    selectedText: writingCopilotSelectedText || null,
                    selectedTextLabel: writingCopilotSelectedText ? 'Từ khóa trích đoạn' : null,
                    contextImages: mergeCopilotImages(
                        writingCopilotBaseContext.contextImages,
                        ...writingCopilotFocuses.map((focus) => focus.images),
                    ),
                }
                : null
        ),
        [
            writingCopilotBaseContext,
            writingCopilotFocuses,
            writingCopilotSelectedText,
            writingFocusSummaryLabel,
            writingFocusSummaryText,
        ],
    );
    useEffect(() => {
        if (!showObjectiveReview) {
            setObjectiveReviewLayout({ open: false, reservedWidth: 0 });
        }
    }, [showObjectiveReview, session?.sessionId]);

    useEffect(() => {
        if (!isWritingSession) {
            setWritingCopilotLayout({ open: false, reservedWidth: 0 });
        }
    }, [isWritingSession, session?.sessionId]);

    useEffect(() => {
        setWritingCopilotOpen(false);
        setWritingCopilotPrepared(false);
        setWritingCopilotLoadingContext(false);
        setWritingCopilotErrorMessage(null);
        setWritingCopilotDraftMessage('');
        setWritingCopilotMessages([]);
        setWritingCopilotSelectedText('');
        setWritingCopilotFocuses([]);
        setWritingCopilotStreamingMessageId(null);
        setWritingCopilotLayout({ open: false, reservedWidth: 0 });
        writingCopilotAbortRef.current?.abort();
        if (writingCopilotPreparationTimeoutRef.current != null) {
            window.clearTimeout(writingCopilotPreparationTimeoutRef.current);
            writingCopilotPreparationTimeoutRef.current = null;
        }
    }, [session?.sessionId]);

    useEffect(() => () => {
        writingCopilotAbortRef.current?.abort();
        if (writingCopilotPreparationTimeoutRef.current != null) {
            window.clearTimeout(writingCopilotPreparationTimeoutRef.current);
        }
    }, []);

    const latestMutationResult = isWritingSession ? submitWritingMutation.data : submitMutation.data;
    const result = session?.result ?? latestMutationResult ?? null;
    const canRetryWritingScore = isWritingSession && session?.status === 'Submitted' && result?.writingScore == null;
    const canSubmitNow = !!session && (session.status === 'InProgress' || canRetryWritingScore) && isSupportedRunnerSkill(session.skillType);
    const activeSubmitLoading = isWritingSession ? submitWritingMutation.isPending : submitMutation.isPending;
    const writingScoreReady = isWritingSession && result?.writingScore != null;
    const writingScoringFinished = isWritingSession && session?.status === 'Completed';
    const showWritingScoringView = isWritingSession
        && (
            (activeSubmitLoading && !writingScoringFinished)
            || (session?.status === 'Submitted' && !writingScoreReady)
        );
    const canUseWritingCopilot = isWritingSession && writingScoreReady && !showWritingScoringView;
    const writingCopilotSelectionChipLabel = useMemo(
        () => extractSelectionKeywords(writingCopilotSelectedText).join(', ') || 'trích đoạn đã chọn',
        [writingCopilotSelectedText],
    );
    const activeReviewLayout = showObjectiveReview
        ? objectiveReviewLayout
        : (canUseWritingCopilot ? writingCopilotLayout : { open: false, reservedWidth: 0 });
    const reviewPanelBleedRight = activeReviewLayout.open ? CLIENT_LAYOUT_CONTENT_GUTTER : 0;
    const reservedReviewWidth = activeReviewLayout.reservedWidth > 0
        ? Math.max(activeReviewLayout.reservedWidth - reviewPanelBleedRight, 0)
        : 0;
    const writingScoringStages = [
        'Đang gửi bài viết đến AI để bắt đầu chấm điểm...',
        'AI đang đọc đề bài và bài viết của học viên...',
        'AI đang đánh giá bố cục, từ vựng và ngữ pháp...',
        'AI đang tổng hợp band score và feedback chi tiết...',
    ];
    const [writingScoringPhaseIndex, setWritingScoringPhaseIndex] = useState(0);

    useEffect(() => {
        if (!showWritingScoringView) {
            setWritingScoringPhaseIndex(0);
            return;
        }

        const interval = window.setInterval(() => {
            setWritingScoringPhaseIndex((current) => current + 1);
        }, 1600);

        return () => window.clearInterval(interval);
    }, [showWritingScoringView]);

    useEffect(() => {
        if (!isWritingSession || activeSubmitLoading || session?.status !== 'Submitted' || result?.writingScore != null) {
            return;
        }

        const interval = window.setInterval(() => {
            refetch();
        }, 5000);

        return () => window.clearInterval(interval);
    }, [activeSubmitLoading, isWritingSession, refetch, result?.writingScore, session?.status]);

    useEffect(() => {
        if (!canUseWritingCopilot) {
            setWritingCopilotOpen(false);
        }
    }, [canUseWritingCopilot]);

    useEffect(() => {
        if (!isWritingSession || session?.status !== 'Completed') {
            return;
        }

        submitWritingMutation.reset();
    }, [isWritingSession, session?.status, submitWritingMutation]);

    useEffect(() => {
        if (!isWritingSession) {
            return;
        }

        const handleInsertSelectionShortcut = (event: KeyboardEvent) => {
            if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'l') {
                return;
            }

            const nextSelectedText = readSelectedReviewText();
            if (!nextSelectedText) {
                return;
            }

            event.preventDefault();
            setWritingCopilotSelectedText(nextSelectedText);
            if (!writingCopilotOpen) {
                setWritingCopilotErrorMessage(null);
                setWritingCopilotOpen(true);
                if (writingCopilotPreparationTimeoutRef.current != null) {
                    window.clearTimeout(writingCopilotPreparationTimeoutRef.current);
                    writingCopilotPreparationTimeoutRef.current = null;
                }

                if (writingCopilotPrepared) {
                    setWritingCopilotLoadingContext(false);
                } else {
                    setWritingCopilotLoadingContext(true);
                    writingCopilotPreparationTimeoutRef.current = window.setTimeout(() => {
                        setWritingCopilotPrepared(true);
                        setWritingCopilotLoadingContext(false);
                        writingCopilotPreparationTimeoutRef.current = null;
                    }, 520);
                }
            }
            setWritingCopilotComposerFocusSignal((current) => current + 1);
        };

        window.addEventListener('keydown', handleInsertSelectionShortcut, true);
        return () => window.removeEventListener('keydown', handleInsertSelectionShortcut, true);
    }, [isWritingSession, writingCopilotOpen, writingCopilotPrepared]);

    if (isLoading) {
        return (
            <Card style={{ borderRadius: 24 }}>
                <Paragraph style={{ margin: 0 }}>Dang tai session...</Paragraph>
            </Card>
        );
    }

    if (isError || !session) {
        return (
            <Card style={{ borderRadius: 24 }}>
                <Empty
                    description="Khong tim thay session can nop bai."
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                >
                    <Button type="primary" onClick={() => navigate('/app/my-exams')}>
                        Quay ve Bai thi cua toi
                    </Button>
                </Empty>
            </Card>
        );
    }
    const writingTasks = getWritingTasks(session);
    const writingAnswerMap = getWritingAnswerMap(session);
    const submittedWritingTasks = writingTasks.filter((task) => countWords(writingAnswerMap[task.id]) >= WRITING_SUBMIT_MIN_WORDS).length;
    const writingFeedbacks = getWritingFeedbacks(session);
    const orderedWritingFeedbacks = getWeightedWritingFeedbackByCriteria(session);
    const writingTaskChartData = getWritingTaskChartData(session);
    const writingTaskFeedbackSections = getWritingTaskFeedbackSections(session);
    const writingTaskSubmissions = writingTasks.map((task, index) => {
        const answerText = writingAnswerMap[task.id] ?? '';
        return {
            key: task.id,
            taskNumber: task.taskNumber ?? index + 1,
            promptText: task.promptText,
            imageUrls: parseWritingAssets(task.assetsData),
            minWords: task.minWords,
            answerText,
            wordCount: countWords(answerText),
        };
    });
    const parsedWritingFeedback = parseWritingOverallFeedback(result?.overallFeedback ?? session.result?.overallFeedback);
    const writingCorrections = parsedWritingFeedback?.tasks?.flatMap((task) => task.detailed_corrections ?? []) ?? [];
    const progressLabel = isWritingSession
        ? `${submittedWritingTasks}/${writingTasks.length} task`
        : `${session.answeredQuestions}/${session.totalQuestions} câu`;
    const showStackedObjectiveSummary = showObjectiveReview && objectiveReviewLayout.open;
    const mainColLg = isWritingSession ? 12 : (showStackedObjectiveSummary ? 24 : 15);
    const resultColLg = isWritingSession ? 12 : (showStackedObjectiveSummary ? 24 : 9);
    const objectiveAnsweredValue = result
        ? `${result.answeredQuestions}/${result.totalQuestions}`
        : `${session.answeredQuestions}/${session.totalQuestions}`;
    const objectiveAccuracyValue = `${result?.accuracyPercent ?? 0}%`;
    const objectiveSkillLabel = getSkillLabel(session.skillType);
    const objectiveScoreValue = result?.totalAutoScore?.toFixed(1) || '0.0';
    const summaryInfoCards = [
        { key: 'startedAt', label: 'Bắt đầu', value: formatDateTimeToMinute(session.startedAt) || 'N/A' },
        { key: 'endedAt', label: 'Kết thúc', value: formatDateTimeToMinute(session.endedAt) || 'Chưa nộp' },
        { key: 'timer', label: 'Thời gian còn lại', value: formatSeconds(session.timeRemaining) },
        { key: 'progress', label: 'Tiến độ', value: progressLabel },
    ];
    const objectiveStatCards = [
        { key: 'score', label: 'Điểm đạt được', value: objectiveScoreValue, accent: '#2563eb', tone: '#eff6ff' },
        { key: 'correct', label: 'Câu đúng', value: String(result?.correctQuestions ?? 0), accent: '#16a34a', tone: '#f0fdf4' },
        { key: 'answered', label: 'Đã trả lời', value: objectiveAnsweredValue, accent: '#d97706', tone: '#fff7ed' },
        { key: 'accuracy', label: 'Độ chính xác', value: objectiveAccuracyValue, accent: '#7c3aed', tone: '#f5f3ff' },
    ];

    const updateWritingCopilotMessages = (updater: (messages: CopilotChatMessage[]) => CopilotChatMessage[]) => {
        setWritingCopilotMessages((current) => updater(current));
    };

    const stopWritingCopilotStream = () => {
        writingCopilotAbortRef.current?.abort();
        writingCopilotAbortRef.current = null;
        setWritingCopilotStreamingMessageId(null);
    };

    const prepareWritingCopilotIfNeeded = () => {
        if (writingCopilotPreparationTimeoutRef.current != null) {
            window.clearTimeout(writingCopilotPreparationTimeoutRef.current);
            writingCopilotPreparationTimeoutRef.current = null;
        }

        if (writingCopilotPrepared) {
            setWritingCopilotLoadingContext(false);
            return;
        }

        setWritingCopilotLoadingContext(true);
        writingCopilotPreparationTimeoutRef.current = window.setTimeout(() => {
            setWritingCopilotPrepared(true);
            setWritingCopilotLoadingContext(false);
            writingCopilotPreparationTimeoutRef.current = null;
        }, 520);
    };

    const openWritingCopilot = (focus?: CopilotFocusPayload | null) => {
        setWritingCopilotErrorMessage(null);
        setWritingCopilotOpen(true);
        if (focus) {
            setWritingCopilotFocuses((current) => dedupeCopilotFocuses([...current, focus]));
        }
        prepareWritingCopilotIfNeeded();
        setWritingCopilotComposerFocusSignal((current) => current + 1);
    };

    const handleCloseWritingCopilot = () => {
        stopWritingCopilotStream();
        if (writingCopilotPreparationTimeoutRef.current != null) {
            window.clearTimeout(writingCopilotPreparationTimeoutRef.current);
            writingCopilotPreparationTimeoutRef.current = null;
        }
        setWritingCopilotLoadingContext(false);
        setWritingCopilotErrorMessage(null);
        setWritingCopilotOpen(false);
    };

    const handleFocusWritingCopilotTask = (taskId: string) => {
        const task = writingTasks.find((item) => item.id === taskId);
        if (!task) {
            return;
        }

        openWritingCopilot(buildWritingTaskFocusPayload({
            task,
            answer: writingReviewAnswerMap[task.id],
        }));
    };

    const handleSendWritingCopilotMessage = async (userMessage: string) => {
        if (!writingCopilotContext || writingCopilotLoadingContext) {
            return;
        }

        const outgoingUserMessage = buildCopilotOutgoingMessage(userMessage, writingCopilotContext);
        const assistantMessageId = createCopilotMessageId('model');
        const history = writingCopilotMessages
            .filter((item) => item.status !== 'error' && item.content.trim())
            .map(({ role, content }) => ({ role, content }));

        updateWritingCopilotMessages((messages) => [
            ...messages,
            {
                id: createCopilotMessageId('user'),
                role: 'user',
                content: userMessage,
                createdAt: Date.now(),
                status: 'done',
            },
            {
                id: assistantMessageId,
                role: 'model',
                content: '',
                createdAt: Date.now(),
                status: 'streaming',
            },
        ]);

        setWritingCopilotDraftMessage('');
        setWritingCopilotErrorMessage(null);
        stopWritingCopilotStream();
        setWritingCopilotFocuses([]);

        const controller = new AbortController();
        writingCopilotAbortRef.current = controller;
        setWritingCopilotStreamingMessageId(assistantMessageId);

        try {
            await streamCopilotChat({
                payload: {
                    context: writingCopilotContext,
                    userMessage: outgoingUserMessage,
                    chatHistory: history,
                },
                signal: controller.signal,
                onEvent: (event) => {
                    if (event.event === 'chunk') {
                        const delta = typeof event.data.text === 'string' ? event.data.text : '';
                        if (!delta) {
                            return;
                        }

                        updateWritingCopilotMessages((messages) => (
                            messages.map((messageItem) => (
                                messageItem.id === assistantMessageId
                                    ? { ...messageItem, content: `${messageItem.content}${delta}` }
                                    : messageItem
                            ))
                        ));
                        return;
                    }

                    if (event.event === 'error') {
                        throw new Error(
                            typeof event.data.message === 'string'
                                ? event.data.message
                                : 'Không thể kết nối AI Copilot.',
                        );
                    }
                },
            });

            updateWritingCopilotMessages((messages) => (
                messages.map((messageItem) => (
                    messageItem.id === assistantMessageId
                        ? { ...messageItem, status: 'done' }
                        : messageItem
                ))
            ));
        } catch (error) {
            if (controller.signal.aborted) {
                updateWritingCopilotMessages((messages) => (
                    messages.flatMap((messageItem) => {
                        if (messageItem.id !== assistantMessageId) {
                            return [messageItem];
                        }

                        return messageItem.content.trim()
                            ? [{ ...messageItem, status: 'done' as const }]
                            : [];
                    })
                ));
                return;
            }

            const nextErrorMessage = error instanceof Error
                ? error.message
                : 'Không thể kết nối AI Copilot.';

            setWritingCopilotErrorMessage(nextErrorMessage);
            updateWritingCopilotMessages((messages) => (
                messages.flatMap((messageItem) => {
                    if (messageItem.id !== assistantMessageId) {
                        return [messageItem];
                    }

                    return messageItem.content.trim()
                        ? [{ ...messageItem, status: 'error' as const }]
                        : [];
                })
            ));
        } finally {
            if (writingCopilotAbortRef.current === controller) {
                writingCopilotAbortRef.current = null;
            }

            setWritingCopilotStreamingMessageId((current) => current === assistantMessageId ? null : current);
        }
    };

    const handleSubmit = () => {
        if (!canSubmitNow) {
            return;
        }

        if (isWritingSession) {
            const invalidTasks = getInvalidWritingTaskNumbers(session);
            if (invalidTasks.length > 0) {
                message.warning(`Task ${invalidTasks.join(', ')} cần tối thiểu ${WRITING_SUBMIT_MIN_WORDS} từ trước khi nộp.`);
                return;
            }

            submitWritingMutation.mutate(sessionId, {
                onSuccess: () => {
                    refetch();
                    message.success('Đã nộp bài Writing. AI đang chấm...');
                },
                onError: (error: any) => {
                    refetch();
                    const backendMessage = error?.response?.data?.message;
                    const isTimeout = error?.code === 'ECONNABORTED';
                    const errorMessage = backendMessage
                        || (isTimeout
                            ? 'Request chấm Writing quá thời gian chờ. Bấm chấm lại Writing để thử lại.'
                            : 'Không thể chấm Writing. Kiểm tra backend log/API key rồi thử lại.');
                    message.error(errorMessage);
                },
            });
            return;
        }

        if (isObjectiveSkill(session.skillType)) {
            submitMutation.mutate(sessionId, { onSuccess: () => refetch() });
        }
    };

    const handleStartNewAttempt = (attemptMode?: ListeningAttemptMode) => {
        startSessionMutation.mutate(
            { examId: session.examId, forceNew: true },
            {
                onSuccess: (nextSession) => {
                    if (attemptMode) {
                        setListeningAttemptMode(nextSession.sessionId, attemptMode);
                    }
                    message.success('Đã tạo lượt làm bài mới.');
                    navigate(getSessionRunnerPath(nextSession.sessionId, nextSession.skillType));
                },
            },
        );
    };

    return (
        <>
            {headerSlot ? createPortal(
                <>
                    <style>{`
                        .session-submit-page-toolbar {
                            display: flex;
                            align-items: center;
                            gap: 12px;
                            width: 100%;
                            min-width: 0;
                            height: 100%;
                            flex: 1 1 auto;
                        }

                        .session-submit-back-button {
                            width: 40px;
                            height: 40px;
                            flex: 0 0 40px;
                            border-radius: 12px;
                            border: 1px solid #dbeafe;
                            background: linear-gradient(135deg, #ffffff 0%, #f8fbff 100%);
                            color: #0f172a;
                            box-shadow: 0 4px 14px rgba(15, 23, 42, 0.06);
                        }

                        .session-submit-title-block {
                            display: flex;
                            align-items: center;
                            gap: 10px;
                            min-width: 0;
                            flex: 1 1 auto;
                        }

                        .session-submit-title-accent {
                            width: 10px;
                            height: 32px;
                            border-radius: 999px;
                            background: linear-gradient(180deg, #2563eb 0%, #60a5fa 100%);
                            box-shadow: 0 6px 16px rgba(37, 99, 235, 0.28);
                            flex: 0 0 10px;
                        }

                        .session-submit-page-title {
                            min-width: 0;
                            overflow: hidden;
                            text-overflow: ellipsis;
                            white-space: nowrap;
                            font-size: 1.1rem;
                            font-weight: 800;
                            color: #0f172a;
                        }

                        .session-submit-header-meta {
                            display: flex;
                            align-items: center;
                            gap: 8px;
                            flex-wrap: wrap;
                            min-width: 0;
                        }

                        .session-submit-header-chip {
                            display: inline-flex;
                            align-items: center;
                            gap: 6px;
                            height: 34px;
                            padding: 0 12px;
                            border-radius: 999px;
                            border: 1px solid #dbeafe;
                            background: #ffffff;
                            color: #1e293b;
                            font-size: 0.85rem;
                            font-weight: 700;
                            white-space: nowrap;
                        }

                        .session-submit-skill-chip {
                            border-color: #93c5fd;
                            background: #eff6ff;
                            color: #1d4ed8;
                        }

                        .session-submit-status-chip {
                            border-color: #bbf7d0;
                            background: #f0fdf4;
                            color: #16a34a;
                        }

                        .session-submit-header-action {
                            flex: 0 0 auto;
                            height: 40px;
                            border-radius: 12px;
                            box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
                        }

                        .session-submit-header-progress {
                            position: relative;
                            display: inline-flex;
                            align-items: center;
                            gap: 10px;
                            min-width: 196px;
                            height: 40px;
                            padding: 0 16px;
                            border-radius: 14px;
                            border: 1px solid #bfdbfe;
                            background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
                            color: #1d4ed8;
                            font-weight: 800;
                            box-shadow: 0 8px 20px rgba(37, 99, 235, 0.14);
                            overflow: hidden;
                        }

                        .session-submit-header-progress::after {
                            content: "";
                            position: absolute;
                            left: 12px;
                            right: 12px;
                            bottom: 6px;
                            height: 4px;
                            border-radius: 999px;
                            background: rgba(191, 219, 254, 0.95);
                        }

                        .session-submit-header-progress-bar {
                            position: absolute;
                            left: 12px;
                            bottom: 6px;
                            width: 42%;
                            height: 4px;
                            border-radius: 999px;
                            background: linear-gradient(90deg, #2563eb 0%, #38bdf8 100%);
                            animation: session-submit-progress-slide 1.6s ease-in-out infinite;
                            z-index: 1;
                        }

                        .session-submit-header-progress-dot {
                            width: 10px;
                            height: 10px;
                            border-radius: 999px;
                            background: #2563eb;
                            box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.28);
                            animation: session-submit-progress-pulse 1.6s ease-in-out infinite;
                        }

                        @keyframes session-submit-progress-slide {
                            0% { transform: translateX(-16%); }
                            50% { transform: translateX(92%); }
                            100% { transform: translateX(-16%); }
                        }

                        @keyframes session-submit-progress-pulse {
                            0%, 100% { transform: scale(0.9); box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.18); }
                            50% { transform: scale(1); box-shadow: 0 0 0 10px rgba(37, 99, 235, 0); }
                        }
                    `}</style>
                    <div className="session-submit-page-toolbar">
                        <Button
                            type="text"
                            className="session-submit-back-button"
                            icon={<ArrowLeftOutlined />}
                            aria-label="Quay lại bài thi của tôi"
                            title="Bài thi của tôi"
                            onClick={() => navigate('/app/my-exams')}
                        />
                        <div className="session-submit-title-block">
                            <span className="session-submit-title-accent" />
                            <div className="session-submit-page-title" title={session.examTitle}>
                                {session.examTitle}
                            </div>
                        </div>
                        <div className="session-submit-header-meta">
                            <span className="session-submit-header-chip session-submit-skill-chip">{getSkillLabel(session.skillType)}</span>
                            <span className="session-submit-header-chip session-submit-status-chip">{getSessionStatusLabel(session.status)}</span>
                        </div>
                        {showWritingScoringView ? (
                            <div className="session-submit-header-progress">
                                <span className="session-submit-header-progress-dot" />
                                <span>AI đang chấm</span>
                                <span className="session-submit-header-progress-bar" />
                            </div>
                        ) : canSubmitNow ? (
                            <Button
                                type="primary"
                                className="session-submit-header-action"
                                icon={<SendOutlined />}
                                loading={activeSubmitLoading}
                                onClick={handleSubmit}
                            >
                                {canRetryWritingScore ? 'Chấm lại' : 'Nộp bài'}
                            </Button>
                        ) : (
                            <Button
                                className="session-submit-header-action"
                                icon={<ReloadOutlined />}
                                loading={startSessionMutation.isPending}
                                onClick={() => {
                                    if (session.skillType.trim().toUpperCase() === 'LISTENING') {
                                        setPendingListeningRestart(true);
                                        return;
                                    }

                                    handleStartNewAttempt();
                                }}
                            >
                                Làm lại
                            </Button>
                        )}
                    </div>
                </>,
                headerSlot,
            ) : null}

            {headerSlot && canUseWritingCopilot ? createPortal(
                <Button
                    type="text"
                    onClick={() => (writingCopilotOpen ? handleCloseWritingCopilot() : openWritingCopilot(null))}
                    style={{
                        height: 40,
                        marginLeft: 10,
                        paddingInline: 16,
                        borderRadius: 999,
                        border: writingCopilotOpen ? '1px solid #93c5fd' : '1px solid #dbeafe',
                        background: writingCopilotOpen
                            ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)'
                            : 'linear-gradient(135deg, #ffffff 0%, #f8fbff 100%)',
                        color: '#1d4ed8',
                        fontWeight: 700,
                        boxShadow: writingCopilotOpen
                            ? '0 8px 18px rgba(59, 130, 246, 0.18)'
                            : '0 6px 14px rgba(15, 23, 42, 0.06)',
                        flexShrink: 0,
                    }}
                >
                    <Space size={8}>
                        <BulbOutlined />
                        <span>AI gia sư</span>
                    </Space>
                </Button>,
                headerSlot,
            ) : null}

            <div
                style={{
                    width: reviewPanelBleedRight > 0 ? `calc(100% + ${reviewPanelBleedRight}px)` : '100%',
                    marginRight: reviewPanelBleedRight > 0 ? -reviewPanelBleedRight : 0,
                    paddingRight: reservedReviewWidth,
                    transition: 'padding-right 0.22s ease',
                }}
            >
                <Space direction="vertical" size={20} style={{ width: '100%' }}>
                    {showWritingScoringView ? (
                        <Card
                            style={{
                                borderRadius: 24,
                                border: '1px solid #bfdbfe',
                                background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 52%, #f8fbff 100%)',
                                overflow: 'hidden',
                            }}
                        >
                            <style>{`
                                @keyframes writing-scoring-glow {
                                    0% { transform: translateX(-35%); opacity: 0.2; }
                                    50% { opacity: 0.95; }
                                    100% { transform: translateX(165%); opacity: 0.2; }
                                }
                            `}</style>
                            <Space direction="vertical" size={20} style={{ width: '100%' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                                    <div style={{ minWidth: 0, maxWidth: 760 }}>
                                        <Text
                                            style={{
                                                display: 'inline-block',
                                                marginBottom: 10,
                                                fontSize: 12,
                                                fontWeight: 800,
                                                letterSpacing: '0.08em',
                                                textTransform: 'uppercase',
                                                color: '#2563eb',
                                            }}
                                        >
                                            AI đang chấm bài Writing
                                        </Text>
                                        <Title level={3} style={{ margin: 0, color: '#0f172a' }}>
                                            Bài viết đã được lưu, đang chờ band score và feedback
                                        </Title>
                                        <Paragraph style={{ margin: '10px 0 0', color: '#475569', maxWidth: 720 }}>
                                            Hệ thống đang tự động chấm bài theo các tiêu chí IELTS Writing. Bạn chưa cần hỏi AI ở bước này; kết quả và nút AI gia sư sẽ xuất hiện sau khi chấm xong.
                                        </Paragraph>
                                    </div>
                                    <div
                                        style={{
                                            padding: '10px 14px',
                                            borderRadius: 999,
                                            border: '1px solid #bfdbfe',
                                            background: '#ffffff',
                                            color: '#1d4ed8',
                                            fontWeight: 800,
                                            boxShadow: '0 10px 24px rgba(37, 99, 235, 0.08)',
                                        }}
                                    >
                                        {submittedWritingTasks}/{writingTasks.length} task đã lưu
                                    </div>
                                </div>

                                <div
                                    style={{
                                        position: 'relative',
                                        height: 18,
                                        borderRadius: 999,
                                        background: 'rgba(191, 219, 254, 0.45)',
                                        overflow: 'hidden',
                                        border: '1px solid #dbeafe',
                                    }}
                                >
                                    <div
                                        style={{
                                            position: 'absolute',
                                            inset: 0,
                                            width: `${activeSubmitLoading ? 34 + (writingScoringPhaseIndex % 3) * 9 : 64 + (writingScoringPhaseIndex % 5) * 5}%`,
                                            borderRadius: 999,
                                            background: 'linear-gradient(90deg, #2563eb 0%, #38bdf8 100%)',
                                            transition: 'width 1.2s ease',
                                        }}
                                    />
                                    <div
                                        style={{
                                            position: 'absolute',
                                            top: 0,
                                            bottom: 0,
                                            width: '36%',
                                            background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.55) 50%, rgba(255,255,255,0) 100%)',
                                            animation: 'writing-scoring-glow 2.2s linear infinite',
                                        }}
                                    />
                                </div>

                                <div
                                    style={{
                                        padding: 18,
                                        borderRadius: 20,
                                        border: '1px solid #dbeafe',
                                        background: '#ffffff',
                                        boxShadow: '0 12px 28px rgba(15, 23, 42, 0.05)',
                                    }}
                                >
                                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                                        <Text strong style={{ color: '#0f172a', fontSize: 16 }}>
                                            {writingScoringStages[writingScoringPhaseIndex % writingScoringStages.length]}
                                        </Text>
                                        <Row gutter={[12, 12]}>
                                            {[
                                                'Phân tích đề bài',
                                                'Đánh giá nội dung',
                                                'Kiểm tra từ vựng và ngữ pháp',
                                                'Tổng hợp điểm và feedback',
                                            ].map((step, index) => {
                                                const isActive = index === (writingScoringPhaseIndex % 4);
                                                const isCompleted = index < (writingScoringPhaseIndex % 4);

                                                return (
                                                    <Col xs={24} sm={12} md={6} key={step}>
                                                        <div
                                                            style={{
                                                                height: '100%',
                                                                padding: 14,
                                                                borderRadius: 16,
                                                                border: isActive
                                                                    ? '1px solid #93c5fd'
                                                                    : isCompleted
                                                                        ? '1px solid #bbf7d0'
                                                                        : '1px solid #e2e8f0',
                                                                background: isActive
                                                                    ? '#eff6ff'
                                                                    : isCompleted
                                                                        ? '#f0fdf4'
                                                                        : '#f8fafc',
                                                            }}
                                                        >
                                                            <Text strong style={{ color: isActive ? '#1d4ed8' : isCompleted ? '#15803d' : '#334155' }}>
                                                                {step}
                                                            </Text>
                                                        </div>
                                                    </Col>
                                                );
                                            })}
                                        </Row>
                                    </Space>
                                </div>
                            </Space>
                        </Card>
                    ) : null}

                    {!showWritingScoringView ? (
                    <Row gutter={[16, 16]}>
                <Col xs={24} lg={mainColLg}>
                    <Space direction="vertical" size={16} style={{ width: '100%' }}>
                    <Card style={{ borderRadius: 22 }}>
                        <Space direction="vertical" size={16} style={{ width: '100%' }}>
                            {canSubmitNow ? (
                                <Alert
                                    type="warning"
                                    showIcon
                                    message={canRetryWritingScore ? 'Writing đã nộp nhưng chưa có điểm' : (isWritingSession ? 'Bạn sắp nộp bài Writing' : 'Bạn sắp nộp bài objective')}
                                    description={canRetryWritingScore
                                        ? 'Bạn có thể bấm chấm lại để gọi AI scoring cho bài đã lưu.'
                                        : isWritingSession
                                        ? `Mỗi task cần tối thiểu ${WRITING_SUBMIT_MIN_WORDS} từ. Sau khi nộp, hệ thống sẽ gọi AI để chấm Writing.`
                                        : 'Sau khi nộp, session sẽ chuyển sang Completed và hiện kết quả objective ngay tại trang này.'}
                                />
                            ) : isWritingSession ? (
                                <Alert
                                    type="success"
                                    showIcon
                                    message="Bài Writing đã được nộp"
                                    description={result?.writingScore != null
                                        ? 'AI đã trả điểm và feedback Writing.'
                                        : 'Bài viết đã được lưu. Nếu chưa có điểm, kiểm tra cấu hình Gemini/API key hoặc thử nộp lại.'}
                                />
                            ) : null}

                            <div
                                style={{
                                    padding: 22,
                                    borderRadius: 22,
                                    border: '1px solid #dbeafe',
                                    background: 'linear-gradient(135deg, #f8fbff 0%, #ffffff 48%, #f0fdf4 100%)',
                                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
                                }}
                            >
                                <Space direction="vertical" size={18} style={{ width: '100%' }}>
                                    <div
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            gap: 16,
                                            alignItems: 'flex-start',
                                            flexWrap: 'wrap',
                                        }}
                                    >
                                        <div style={{ minWidth: 0 }}>
                                            <Text
                                                style={{
                                                    display: 'inline-block',
                                                    marginBottom: 8,
                                                    fontSize: 12,
                                                    fontWeight: 800,
                                                    letterSpacing: '0.08em',
                                                    textTransform: 'uppercase',
                                                    color: '#2563eb',
                                                }}
                                            >
                                                Tổng quan bài làm
                                            </Text>
                                            <Title level={3} style={{ margin: 0, color: '#0f172a' }}>
                                                {session.examTitle}
                                            </Title>
                                            <Paragraph style={{ margin: '8px 0 0', color: '#475569' }}>
                                                Kỹ năng <b>{objectiveSkillLabel}</b> · Trạng thái <b>{getSessionStatusLabel(session.status)}</b>
                                            </Paragraph>
                                        </div>
                                        <Space wrap size={[8, 8]}>
                                            <Tag
                                                style={{
                                                    margin: 0,
                                                    padding: '6px 12px',
                                                    borderRadius: 999,
                                                    borderColor: '#93c5fd',
                                                    background: '#eff6ff',
                                                    color: '#1d4ed8',
                                                    fontWeight: 700,
                                                }}
                                            >
                                                {objectiveSkillLabel}
                                            </Tag>
                                            <Tag
                                                style={{
                                                    margin: 0,
                                                    padding: '6px 12px',
                                                    borderRadius: 999,
                                                    borderColor: '#bbf7d0',
                                                    background: '#f0fdf4',
                                                    color: '#15803d',
                                                    fontWeight: 700,
                                                }}
                                            >
                                                {getSessionStatusLabel(session.status)}
                                            </Tag>
                                        </Space>
                                    </div>

                                    <Row gutter={[12, 12]}>
                                        {summaryInfoCards.map((item) => (
                                            <Col xs={24} sm={12} key={item.key}>
                                                <div
                                                    style={{
                                                        height: '100%',
                                                        padding: 16,
                                                        borderRadius: 18,
                                                        border: '1px solid #e2e8f0',
                                                        background: 'rgba(255,255,255,0.92)',
                                                    }}
                                                >
                                                    <Text style={{ display: 'block', color: '#64748b', fontSize: 13 }}>
                                                        {item.label}
                                                    </Text>
                                                    <Text
                                                        strong
                                                        style={{
                                                            display: 'block',
                                                            marginTop: 6,
                                                            fontSize: 18,
                                                            color: '#0f172a',
                                                            lineHeight: 1.45,
                                                        }}
                                                    >
                                                        {item.value}
                                                    </Text>
                                                </div>
                                            </Col>
                                        ))}
                                    </Row>
                                </Space>
                            </div>

                            {canSubmitNow ? (
                                <Space wrap>
                                    <Button onClick={() => navigate(getSessionRunnerPath(session.sessionId, session.skillType))}>
                                        Quay lai lam tiep
                                    </Button>
                                    <Button
                                        type="primary"
                                        icon={<SendOutlined />}
                                        loading={activeSubmitLoading}
                                        onClick={handleSubmit}
                                    >
                                        {canRetryWritingScore ? 'Chấm lại Writing' : 'Nộp bài ngay'}
                                    </Button>
                                </Space>
                            ) : null}
                        </Space>
                    </Card>

                    {isWritingSession && !showWritingScoringView && writingFeedbacks.length > 0 ? (
                        <Card
                            style={{
                                borderRadius: 22,
                                border: '1px solid #fed7aa',
                                background: 'linear-gradient(135deg, #fffaf5 0%, #ffffff 100%)',
                            }}
                        >
                            <Space direction="vertical" size={14} style={{ width: '100%' }}>
                                <div>
                                    <Title level={5} style={{ margin: 0 }}>4 tiêu chí chấm Writing</Title>
                                    <Paragraph style={{ margin: '6px 0 0', color: '#78716c' }}>
                                        Điểm tổng hợp theo đúng 4 tiêu chí IELTS Writing cho bài này.
                                    </Paragraph>
                                </div>

                                <Row gutter={[12, 12]}>
                                    {orderedWritingFeedbacks.map((feedback) => (
                                        <Col xs={24} sm={12} key={feedback.criteria}>
                                            <div
                                                style={{
                                                    height: '100%',
                                                    padding: 16,
                                                    borderRadius: 18,
                                                    border: '1px solid #ffedd5',
                                                    background: '#ffffff',
                                                }}
                                            >
                                                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                                                    <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
                                                        <Text strong style={{ color: '#9a3412' }}>
                                                            {feedback.criteria}
                                                            {writingCriteriaLabels[feedback.criteria] ? ` (${writingCriteriaLabels[feedback.criteria]})` : ''}
                                                        </Text>
                                                        <Tag color="orange" style={{ marginInlineEnd: 0 }}>
                                                            {feedback.bandScore > 0 ? feedback.bandScore.toFixed(1) : '—'}
                                                        </Tag>
                                                    </Space>
                                                    {writingCriteriaGuideMap[feedback.criteria]?.length ? (
                                                        <ul
                                                            style={{
                                                                margin: 0,
                                                                paddingLeft: 18,
                                                                color: '#57534e',
                                                                lineHeight: 1.7,
                                                            }}
                                                        >
                                                            {writingCriteriaGuideMap[feedback.criteria].map((item) => (
                                                                <li key={item}>{item}</li>
                                                            ))}
                                                        </ul>
                                                    ) : (
                                                        <Text type="secondary">
                                                            {feedback.comment || 'Chưa có diễn giải cho tiêu chí này.'}
                                                        </Text>
                                                    )}
                                                </Space>
                                            </div>
                                        </Col>
                                    ))}
                                </Row>
                            </Space>
                        </Card>
                    ) : null}
                    </Space>
                </Col>

                <Col xs={24} lg={resultColLg}>
                    <Card style={{ borderRadius: 22, height: '100%' }}>
                        <Space direction="vertical" size={16} style={{ width: '100%' }}>
                            {isWritingSession ? (
                                <>
                                    <Title level={5} style={{ margin: 0 }}>Bài nộp Writing</Title>
                                    <Row gutter={[12, 12]}>
                                        <Col span={12}>
                                            <Statistic title="Task" value={`${submittedWritingTasks}/${writingTasks.length}`} />
                                        </Col>
                                        <Col span={12}>
                                            <Statistic title="Band" value={result?.writingScore != null ? result.writingScore.toFixed(1) : '—'} />
                                        </Col>
                                    </Row>
                                    {writingFeedbacks.length > 0 ? (
                                        <>
                                            <div style={{ textAlign: 'center' }}>
                                                <Text strong>Tổng hợp 2 task</Text>
                                                <br />
                                                <Text type="secondary" style={{ fontSize: 12 }}>
                                                    Overall = (Task 1 x1 + Task 2 x2) / 3, làm tròn 0.5
                                                </Text>
                                            </div>
                                            <WritingRadarChart feedbacks={orderedWritingFeedbacks} />
                                            {writingTaskChartData.length > 0 ? (
                                                <Row gutter={[12, 12]}>
                                                    {writingTaskChartData.map((task) => (
                                                        <Col xs={24} md={12} key={task.key}>
                                                            <Card
                                                                size="small"
                                                                title={`Task ${task.taskNumber}`}
                                                                extra={<Tag color="orange">Band {task.band != null ? task.band.toFixed(1) : '—'}</Tag>}
                                                                style={{
                                                                    borderRadius: 16,
                                                                    border: '1px solid #fed7aa',
                                                                    background: '#fffaf5',
                                                                }}
                                                            >
                                                                <WritingRadarChart feedbacks={task.feedbacks} compact />
                                                            </Card>
                                                        </Col>
                                                    ))}
                                                </Row>
                                            ) : null}
                                        </>
                                    ) : null}
                                    <Alert
                                        type={result?.writingScore != null ? 'success' : 'warning'}
                                        showIcon
                                        message={result?.writingScore != null ? 'Đã có điểm Writing' : 'Chưa có điểm Writing'}
                                        description={result?.writingScore != null
                                            ? 'Mỗi task lấy trung bình 4 tiêu chí IELTS. Overall Writing dùng Task 1 hệ số 1 và Task 2 hệ số 2.'
                                            : 'Bài đã lưu, nhưng chưa có kết quả AI. Kiểm tra backend log/API key nếu trạng thái không đổi.'}
                                    />
                                </>
                            ) : (
                                <>
                                    <div
                                        style={{
                                            padding: 22,
                                            borderRadius: 22,
                                            background: 'linear-gradient(135deg, #0f172a 0%, #1d4ed8 58%, #38bdf8 100%)',
                                            color: '#ffffff',
                                            boxShadow: '0 18px 36px rgba(37, 99, 235, 0.24)',
                                        }}
                                    >
                                        <Text
                                            style={{
                                                display: 'inline-block',
                                                color: 'rgba(255,255,255,0.8)',
                                                fontSize: 12,
                                                fontWeight: 800,
                                                letterSpacing: '0.08em',
                                                textTransform: 'uppercase',
                                            }}
                                        >
                                            Kết quả bài trắc nghiệm
                                        </Text>
                                        <Title level={3} style={{ margin: '10px 0 8px', color: '#ffffff' }}>
                                            {objectiveSkillLabel}
                                        </Title>
                                        <Paragraph style={{ margin: 0, color: 'rgba(255,255,255,0.82)' }}>
                                            Bạn làm đúng <b style={{ color: '#ffffff' }}>{result?.correctQuestions ?? 0}</b> trên{' '}
                                            <b style={{ color: '#ffffff' }}>{result?.totalQuestions ?? session.totalQuestions}</b> câu của bài này.
                                        </Paragraph>

                                        <div
                                            style={{
                                                marginTop: 18,
                                                padding: 18,
                                                borderRadius: 18,
                                                background: 'rgba(255,255,255,0.12)',
                                                border: '1px solid rgba(255,255,255,0.18)',
                                                backdropFilter: 'blur(10px)',
                                            }}
                                        >
                                            <Text style={{ display: 'block', color: 'rgba(255,255,255,0.72)', fontSize: 13 }}>
                                                Điểm tổng kết
                                            </Text>
                                            <Text
                                                strong
                                                style={{
                                                    display: 'block',
                                                    marginTop: 4,
                                                    fontSize: 42,
                                                    lineHeight: 1.05,
                                                    color: '#ffffff',
                                                    letterSpacing: '-0.03em',
                                                }}
                                            >
                                                {objectiveScoreValue}
                                            </Text>
                                        </div>
                                    </div>

                                    <Row gutter={[12, 12]}>
                                        {objectiveStatCards.map((item) => (
                                            <Col xs={12} key={item.key}>
                                                <div
                                                    style={{
                                                        height: '100%',
                                                        padding: 16,
                                                        borderRadius: 18,
                                                        border: '1px solid #e2e8f0',
                                                        background: item.tone,
                                                    }}
                                                >
                                                    <Text style={{ display: 'block', color: '#64748b', fontSize: 13 }}>
                                                        {item.label}
                                                    </Text>
                                                    <Text
                                                        strong
                                                        style={{
                                                            display: 'block',
                                                            marginTop: 6,
                                                            fontSize: 28,
                                                            lineHeight: 1.1,
                                                            color: item.accent,
                                                        }}
                                                    >
                                                        {item.value}
                                                    </Text>
                                                </div>
                                            </Col>
                                        ))}
                                    </Row>

                                </>
                            )}
                        </Space>
                    </Card>
                </Col>
            </Row>
                    ) : null}

            {showObjectiveReview ? (
                <ObjectiveSessionReviewRunner
                    session={session}
                    onCopilotLayoutChange={setObjectiveReviewLayout}
                />
            ) : null}

            {isWritingSession ? (
                <Card style={{ borderRadius: 22 }}>
                    <Space direction="vertical" size={16} style={{ width: '100%' }}>
                        <div>
                            <Title level={4} style={{ margin: 0 }}>Bài viết đã lưu</Title>
                            <Paragraph style={{ margin: '6px 0 0', color: '#64748b' }}>
                                Nội dung dưới đây là bài viết đã được lưu từ lúc học viên làm bài.
                            </Paragraph>
                        </div>

                        <Space direction="vertical" size={16} style={{ width: '100%' }}>
                            {writingTaskSubmissions.map((task) => (
                                <Card
                                    key={task.key}
                                    size="small"
                                    title={`Task ${task.taskNumber}`}
                                    extra={(
                                        <Space wrap size={[8, 8]}>
                                            <Tag color={task.wordCount >= task.minWords ? 'green' : 'orange'}>{task.wordCount} từ</Tag>
                                            {canUseWritingCopilot ? (
                                                <Button
                                                    size="small"
                                                    type={writingCopilotFocuses.some((focus) => focus.label === `Task ${task.taskNumber}`) ? 'primary' : 'default'}
                                                    icon={<SendOutlined />}
                                                    onClick={() => handleFocusWritingCopilotTask(task.key)}
                                                >
                                                    Hỏi AI gia sư
                                                </Button>
                                            ) : null}
                                        </Space>
                                    )}
                                    style={{
                                        borderRadius: 18,
                                        border: '1px solid #dbeafe',
                                        background: 'linear-gradient(135deg, #f8fbff 0%, #ffffff 100%)',
                                    }}
                                >
                                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                                        <div
                                            style={{
                                                padding: 14,
                                                borderRadius: 14,
                                                background: '#f8fafc',
                                                border: '1px solid #e2e8f0',
                                            }}
                                        >
                                            <Text strong>Đề bài</Text>
                                            <Paragraph style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>
                                                {task.promptText}
                                            </Paragraph>
                                        </div>

                                        {task.imageUrls.length > 0 ? (
                                            <div
                                                style={{
                                                    padding: 14,
                                                    borderRadius: 14,
                                                    background: '#fff7ed',
                                                    border: '1px solid #fed7aa',
                                                }}
                                            >
                                                <Text strong>Hình đề bài</Text>
                                                <Space direction="vertical" size={12} style={{ width: '100%', marginTop: 10 }}>
                                                    {task.imageUrls.map((url) => (
                                                        <img
                                                            key={url}
                                                            src={url}
                                                            alt={`Writing task ${task.taskNumber} visual`}
                                                            style={{
                                                                display: 'block',
                                                                width: 'auto',
                                                                maxWidth: '100%',
                                                                maxHeight: 360,
                                                                margin: '0 auto',
                                                                borderRadius: 14,
                                                                border: '1px solid #fdba74',
                                                                objectFit: 'contain',
                                                            }}
                                                        />
                                                    ))}
                                                </Space>
                                            </div>
                                        ) : null}

                                        <div
                                            style={{
                                                padding: 16,
                                                borderRadius: 14,
                                                background: '#ffffff',
                                                border: '1px solid #dbeafe',
                                                minHeight: 160,
                                            }}
                                        >
                                            <Text strong>Bài làm của học viên</Text>
                                            {task.answerText.trim() ? (
                                                <Paragraph style={{ margin: '10px 0 0', whiteSpace: 'pre-wrap', lineHeight: 1.75 }}>
                                                    {task.answerText}
                                                </Paragraph>
                                            ) : (
                                                <Paragraph type="secondary" style={{ margin: '10px 0 0' }}>
                                                    Task này chưa có nội dung được lưu.
                                                </Paragraph>
                                            )}
                                        </div>
                                    </Space>
                                </Card>
                            ))}
                        </Space>
                    </Space>
                </Card>
            ) : null}

            {isWritingSession && writingFeedbacks.length > 0 ? (
                <Card style={{ borderRadius: 22 }}>
                    <Space direction="vertical" size={16} style={{ width: '100%' }}>
                        <div>
                            <Title level={4} style={{ margin: 0 }}>Feedback IELTS Writing</Title>
                            <Paragraph style={{ margin: '6px 0 0', color: '#64748b' }}>
                                Feedback chi tiết theo từng part/task và 4 tiêu chí IELTS.
                            </Paragraph>
                        </div>

                        <Space direction="vertical" size={16} style={{ width: '100%' }}>
                            {writingTaskFeedbackSections.map((task) => (
                                <Card
                                    key={task.key}
                                    size="small"
                                    title={`Part ${task.taskNumber}`}
                                    extra={<Tag color="orange">Band {task.band != null ? task.band.toFixed(1) : '—'}</Tag>}
                                    style={{
                                        borderRadius: 18,
                                        border: '1px solid #fed7aa',
                                        background: 'linear-gradient(135deg, #fff7ed 0%, #ffffff 100%)',
                                    }}
                                >
                                    <Row gutter={[14, 14]}>
                                        {task.feedbacks.map((feedback) => (
                                            <Col xs={24} md={12} key={`${task.key}-${feedback.criteria}`}>
                                                <Card
                                                    size="small"
                                                    style={{
                                                        borderRadius: 14,
                                                        border: '1px solid #ffedd5',
                                                        background: '#ffffff',
                                                        height: '100%',
                                                    }}
                                                >
                                                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                                                        <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
                                                            <Text strong>{feedback.criteria}</Text>
                                                            <Tag color="orange">{feedback.bandScore > 0 ? feedback.bandScore.toFixed(1) : '—'}</Tag>
                                                        </Space>
                                                        {feedback.comment ? (
                                                            <Text>{feedback.comment}</Text>
                                                        ) : (
                                                            <Text type="secondary">Chưa có nhận xét cho tiêu chí này.</Text>
                                                        )}
                                                        {feedback.improvements ? (
                                                            <Text type="secondary">
                                                                <b>Cải thiện:</b> {feedback.improvements}
                                                            </Text>
                                                        ) : null}
                                                    </Space>
                                                </Card>
                                            </Col>
                                        ))}
                                    </Row>
                                </Card>
                            ))}
                        </Space>

                        {writingCorrections.length > 0 ? (
                            <Card
                                size="small"
                                title="Các lỗi AI gợi ý sửa"
                                style={{ borderRadius: 16, border: '1px solid #e2e8f0' }}
                            >
                                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                                    {writingCorrections.slice(0, 8).map((correction, index) => (
                                        <div
                                            key={`${correction.start_index ?? index}-${correction.original_text ?? index}`}
                                            style={{
                                                padding: 12,
                                                borderRadius: 12,
                                                background: '#f8fafc',
                                                border: '1px solid #e2e8f0',
                                            }}
                                        >
                                            <Space direction="vertical" size={4} style={{ width: '100%' }}>
                                                {correction.criteria ? <Tag style={{ width: 'fit-content' }}>{correction.criteria}</Tag> : null}
                                                {correction.original_text ? (
                                                    <Text delete style={{ color: '#b91c1c' }}>{correction.original_text}</Text>
                                                ) : null}
                                                {correction.corrected_text ? (
                                                    <Text style={{ color: '#15803d' }}>{correction.corrected_text}</Text>
                                                ) : null}
                                                {correction.explanation ? (
                                                    <Text type="secondary">{correction.explanation}</Text>
                                                ) : null}
                                            </Space>
                                        </div>
                                    ))}
                                </Space>
                            </Card>
                        ) : null}
                    </Space>
                </Card>
            ) : null}

            {canUseWritingCopilot ? (
                <ReviewCopilotDrawer
                    open={writingCopilotOpen}
                    loadingContext={writingCopilotLoadingContext}
                    context={writingCopilotContext}
                    messages={writingCopilotMessages}
                    draftMessage={writingCopilotDraftMessage}
                    isStreaming={!!writingCopilotStreamingMessageId}
                    errorMessage={writingCopilotErrorMessage}
                    focusComposerSignal={writingCopilotComposerFocusSignal}
                    focusChips={writingCopilotFocuses}
                    onClose={handleCloseWritingCopilot}
                    onDraftChange={setWritingCopilotDraftMessage}
                    onSendMessage={handleSendWritingCopilotMessage}
                    onStopStreaming={stopWritingCopilotStream}
                    onClearFocus={() => setWritingCopilotFocuses([])}
                    onRemoveFocus={(focusToRemove) => setWritingCopilotFocuses((current) => current.filter((focus) => (
                        focus.label !== focusToRemove.label
                    )))}
                    onClearSelection={() => setWritingCopilotSelectedText('')}
                    selectionChipLabel={writingCopilotSelectionChipLabel}
                    onReservedWidthChange={(nextWidth) => setWritingCopilotLayout({
                        open: nextWidth > 0,
                        reservedWidth: nextWidth,
                    })}
                />
            ) : null}
                </Space>
            </div>
            <ListeningAttemptModeModal
                open={pendingListeningRestart}
                loading={startSessionMutation.isPending}
                onCancel={() => setPendingListeningRestart(false)}
                onSelectMode={(mode) => {
                    setPendingListeningRestart(false);
                    handleStartNewAttempt(mode);
                }}
            />
        </>
    );
};
