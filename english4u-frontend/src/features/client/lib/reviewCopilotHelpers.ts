import type {
    CopilotContextImagePayload,
    CopilotFocusPayload,
    CopilotReplayAction,
    ReviewCopilotContext
} from '../types/copilot.types';
import type {
    PracticeSessionDto,
    PracticeSessionAnswerDto,
    PracticeSessionListeningPartDto,
    PracticeSessionQuestionDto,
    PracticeSessionQuestionGroupDto
} from '../types/session.types';
import {
    findListeningReplayMatch,
    findListeningTranscriptSnippetByTime,
    formatTranscriptRangeLabel,
    parseListeningTranscriptEnvelope
} from '@/shared/lib/listeningTranscript';
import { isObjectiveSkill } from '../lib/sessionRouting';
import {
    inferListeningQuestionEvidenceMatch,
    resolveQuestionSpecificCorrectAnswer
} from '../lib/reviewCopilotContext';

export const LISTENING_REPLAY_PREROLL_SECONDS = 10;
export const LISTENING_REPLAY_POSTROLL_SECONDS = 5;

export const createCopilotMessageId = (prefix: 'user' | 'model') =>
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const mergeCopilotImages = (...groups: Array<CopilotContextImagePayload[] | null | undefined>) => {
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

export const dedupeCopilotFocuses = (focuses: CopilotFocusPayload[]) => {
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

export const buildCopilotOutgoingMessage = (message: string, context: ReviewCopilotContext) => {
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

    if (isObjectiveSkill(context.skillType) && (context.focusedQuestionNumber != null || !!context.currentFocusText?.trim())) {
        prefixes.push(
            [
                'Với câu objective đang được hỏi hoặc đang focus, không được chỉ trả lời bằng một chữ cái, một từ hoặc ký hiệu đáp án trần.',
                'Hãy trả lời đúng trọng tâm câu hỏi của học viên, nêu đáp án rồi giải thích đủ rõ vì sao dựa trên dữ kiện trong bài review.',
            ].join(' '),
        );
    }

    if (context.skillType.trim().toUpperCase() === 'READING' && context.currentFocusText?.trim()) {
        prefixes.push(
            [
                'Nếu đây là câu Reading và học viên hỏi kiểu "đọc đâu", "vì sao chọn", "loại thế nào", hãy chỉ rõ ý/đoạn trong passage liên quan.',
                'Không cần trả lời theo khuôn cứng; hãy giải đáp tự nhiên như gia sư, nhưng phải ưu tiên trả lời trực tiếp câu hỏi của học viên.',
                'Bắt đầu ngay bằng câu trả lời cho học viên; không viết phần nháp như Current Focus, Student choice, Scanning, Found in Paragraph, Tone hoặc No meta-talk.',
                'Nếu học viên hỏi "đọc chỗ nào để trả lời đúng", hãy bắt đầu bằng đáp án đúng và vị trí/dẫn chứng chứng minh đáp án đúng; sau đó mới giải thích vì sao đáp án học viên sai nếu cần.',
                'Nhãn [Đoạn 1, câu 2] trong ngữ cảnh được tạo theo đúng nhãn Đoạn đang hiển thị ở FE; không tự đếm lại đoạn theo cách khác. Hãy dùng nhãn đó khi hữu ích và trích đúng câu/cụm tiếng Anh then chốt, không chỉ nói chung chung.',
                'Nếu học viên nhắc nhiều câu, trả lời lần lượt từng câu; không dùng focus cũ nếu tin nhắn hiện tại đã nêu số câu khác.',
            ].join(' '),
        );

        if (hasReadingEvidenceLocationIntent(trimmedMessage)) {
            prefixes.push(
                [
                    'Đây là yêu cầu tìm vị trí bằng chứng trong Reading.',
                    'Nếu context có cả "Học viên chọn" và "Đáp án đúng", hãy dùng "Đáp án đúng" để tìm bằng chứng trước; không được lấy đáp án học viên đã sai làm trung tâm trả lời.',
                    'Trả lời theo cùng một khung, viết trực tiếp cho học viên, không nhắc lại tên khung hay quy tắc.',
                    'Thứ tự nội dung: nơi đọc trong bài; đáp án đúng; dẫn chứng tiếng Anh ngắn; vì sao dẫn chứng khớp với đáp án.',
                    'Kể cả khi học viên làm sai, câu đầu tiên vẫn phải chỉ nơi đọc và đáp án đúng; không được bắt đầu bằng lựa chọn sai của học viên.',
                    'Nếu học viên chọn sai, thêm một đoạn cuối giải thích vì sao lựa chọn đó chưa đúng. Nếu học viên đã chọn đúng thì không nhắc lỗi.',
                    'Không tự kiểm tra lại ở cuối câu trả lời, không viết các dòng như "No meta-talk", "Correct labels", "Correct format" hoặc "Start immediately".',
                ].join(' '),
            );
        }
    }

    if (isObjectiveSkill(context.skillType) && (context.contextImages?.length ?? 0) > 0) {
        prefixes.push(
            [
                'Ngữ cảnh hiện có ảnh/sơ đồ/bảng/map liên quan.',
                'Nếu câu hỏi objective có hình, sơ đồ, map, bảng hoặc diagram, hãy đọc cả ảnh được đính kèm và passage/transcript; không chỉ dựa vào đoạn văn.',
                'Khi đáp án phụ thuộc vào hình, hãy nói rõ chi tiết nhìn thấy trong hình đã nối với câu/cụm nào trong bài.',
                'Nếu hình không đủ rõ hoặc không xác nhận được chi tiết, hãy nói rõ giới hạn đó thay vì đoán.',
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

export const getSharedListeningReviewAudioUrl = (parts: PracticeSessionListeningPartDto[] = []) => (
    parts
        .map((part) => (part.audioUrl ?? '').trim())
        .find((audioUrl) => audioUrl.length > 0)
    ?? ''
);

export const normalizeCopilotIntentText = (value: string) => (
    value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
);

export const hasReadingEvidenceLocationIntent = (message: string) => {
    const normalizedMessage = normalizeCopilotIntentText(message)
        .replace(/\s+/g, ' ')
        .trim();

    return /\b(doc dau|doc cho nao|cho nao|doan nao|o dau|tim o dau|bang chung|dan chung|vi tri|line nao|cau nao trong bai)\b/i.test(normalizedMessage)
        && /\b(dung|duoc|lam duoc|tra loi|tim dap an|dap an|chon|cau nay|question nay|q nay|vi sao)\b/i.test(normalizedMessage);
};

export const sortObjectiveQuestions = (questions: PracticeSessionQuestionDto[]) => (
    [...questions].sort((left, right) => {
        const leftOrder = left.questionNumber ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = right.questionNumber ?? Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder || left.id.localeCompare(right.id);
    })
);

export const sortObjectiveGroups = (groups: PracticeSessionQuestionGroupDto[]) => (
    [...groups].sort((left, right) => {
        const leftOrder = left.startQuestion ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = right.endQuestion ?? Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder || left.id.localeCompare(right.id);
    })
);

export const listeningQuestionNumberWordValues: Record<string, number> = {
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

export const listeningQuestionNumberTokenPattern = [
    '\\d+',
    'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
    'twenty(?:\\s+(?:one|two|three|four|five|six|seven|eight|nine))?',
    'thirty(?:\\s+(?:one|two|three|four|five|six|seven|eight|nine))?',
    'forty',
].join('|');

export const parseListeningQuestionNumberToken = (token: string) => {
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

export const parseQuestionRangeFromListeningTranscriptSegment = (value?: string | null) => {
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
    if (startQuestion === null || endQuestion === null || !Number.isFinite(startQuestion) || !Number.isFinite(endQuestion) || startQuestion > endQuestion) {
        return null;
    }

    return { startQuestion, endQuestion };
};

export const buildQuestionNumberRange = (startQuestion: number, endQuestion: number) => {
    if (!Number.isFinite(startQuestion) || !Number.isFinite(endQuestion) || startQuestion <= 0 || endQuestion <= 0) {
        return [];
    }

    const normalizedStart = Math.min(startQuestion, endQuestion);
    const normalizedEnd = Math.max(startQuestion, endQuestion);
    const rangeLength = normalizedEnd - normalizedStart + 1;
    if (rangeLength > 12) {
        return [];
    }

    return Array.from({ length: rangeLength }, (_, index) => normalizedStart + index);
};

export const dedupeQuestionNumbers = (numbers: number[]) => {
    const seen = new Set<number>();

    return numbers.filter((number) => {
        if (!Number.isFinite(number) || number <= 0 || seen.has(number)) {
            return false;
        }

        seen.add(number);
        return true;
    });
};

export const extractReferencedQuestionNumbers = (message: string, focusedQuestionNumber?: number | null) => {
    const normalizedMessage = normalizeCopilotIntentText(message)
        .replace(/[–—]/g, '-')
        .replace(/\s+/g, ' ')
        .trim();

    const questionPrefix = String.raw`(?:cau|questions?|q)`;
    const separator = String.raw`(?:-|to|den|toi|va|and|,|&|\+)`;
    const prefixedRangeMatch = normalizedMessage.match(new RegExp(String.raw`\b${questionPrefix}\s*(\d{1,3})\s*${separator}\s*(\d{1,3})\b`, 'i'));
    if (prefixedRangeMatch) {
        return buildQuestionNumberRange(Number(prefixedRangeMatch[1]), Number(prefixedRangeMatch[2]));
    }

    const hasQuestionIntent = new RegExp(String.raw`\b${questionPrefix}\b`, 'i').test(normalizedMessage);
    const hasAnswerIntent = /\b(doc dau|o dau|cho nao|doan nao|vi sao|tai sao|giai thich|chon|dap an|dung|sai|loai)\b/i.test(normalizedMessage);
    if (hasQuestionIntent && hasAnswerIntent) {
        const bareRangeMatch = normalizedMessage.match(/\b(\d{1,3})\s*(?:-|to|den|toi)\s*(\d{1,3})\b/i);
        if (bareRangeMatch) {
            return buildQuestionNumberRange(Number(bareRangeMatch[1]), Number(bareRangeMatch[2]));
        }
    }

    const explicitNumbers = Array.from(normalizedMessage.matchAll(new RegExp(String.raw`\b${questionPrefix}\s*(\d{1,3})\b`, 'gi')))
        .map((match) => Number(match[1]))
        .filter((number) => Number.isFinite(number) && number > 0);
    if (explicitNumbers.length > 0) {
        return dedupeQuestionNumbers(explicitNumbers);
    }

    if (focusedQuestionNumber != null && /\b(cau nay|question nay|question this|this question|q nay)\b/i.test(normalizedMessage)) {
        return [focusedQuestionNumber];
    }

    return [];
};

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

export const summarizeAnswerValue = (value?: string | null) => {
    const trimmed = (value ?? '').trim();
    if (!trimmed) {
        return 'Chưa trả lời';
    }

    const tokens = trimmed
        .split('|')
        .map((token) => token.trim())
        .filter(Boolean);

    return tokens.length > 1 ? tokens.join(', ') : trimmed;
};

export const isObjectiveWeaknessSummaryIntent = (message: string, skillType: string) => {
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

export const buildObjectiveWeaknessSummary = ({
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
            questions: sortObjectiveGroups(passage.questionGroups).flatMap((group) => (
                sortObjectiveQuestions(group.questions).map((question) => ({ group, question }))
            )),
        }))
        : listeningParts.map((part, index) => ({
            label: `Part ${part.partNumber ?? index + 1}`,
            questions: sortObjectiveGroups(part.questionGroups).flatMap((group) => (
                sortObjectiveQuestions(group.questions).map((question) => ({ group, question }))
            )),
        }));

    const partLines = containers.map((container) => {
        const wrongEntries = container.questions.flatMap(({ group, question }) => {
            const reviewAnswer = reviewAnswerMap[question.id];
            if (reviewAnswer?.isCorrect !== false) {
                return [];
            }

            return [{
                questionNumber: question.questionNumber,
                userAnswer: summarizeAnswerValue(answerMap[question.id] ?? reviewAnswer.answerText),
                correctAnswer: summarizeAnswerValue(
                    resolveQuestionSpecificCorrectAnswer(group, question, reviewAnswer)
                    || reviewAnswer.correctAnswer
                    || question.correctAnswer,
                ),
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
        total + container.questions.filter(({ question }) => reviewAnswerMap[question.id]?.isCorrect === false).length
    ), 0);

    return [
        `Mình đã tổng hợp toàn bộ câu sai của bài ${skillType === 'LISTENING' ? 'Listening' : 'Reading'} này.`,
        '',
        ...partLines,
        '',
        `**Tổng cộng:** ${totalWrong} câu sai.`,
    ].join('\n');
};

export const hasListeningReplayIntent = (message: string) => {
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

export const extractRequestedReplayQuestionNumber = (message: string, focusedQuestionNumber?: number | null) => {
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

export const extractReferencedQuestionNumber = (message: string, focusedQuestionNumber?: number | null) => {
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

export const isAmbiguousListeningReplayRequest = (message: string, focusedQuestionNumber?: number | null) => {
    if (!hasListeningReplayIntent(message)) {
        return false;
    }

    return extractRequestedReplayQuestionNumber(message, focusedQuestionNumber) == null;
};

export const isCorrectAnswerQuery = (message: string) => {
    const normalized = message
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();

    if (normalized.includes('tai sao sai') || normalized.includes('vi sao sai') || normalized.includes('chua dung') || normalized.includes('chon sai') || normalized.includes('loi sai')) {
        return false;
    }

    return normalized.includes('dung')
        || normalized.includes('correct')
        || normalized.includes('chinh xac')
        || normalized.includes('nghe dau')
        || normalized.includes('nghe cho nao')
        || normalized.includes('nghe doan nao')
        || normalized.includes('o dau')
        || normalized.includes('cho nao')
        || normalized.includes('bang chung')
        || normalized.includes('dan chung')
        || normalized.includes('evidence');
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

export const isNodeInsideCopilotDrawer = (node: Node | null) => {
    const element = node instanceof Element ? node : node?.parentElement ?? null;
    return !!element?.closest('[data-copilot-drawer-root="true"]');
};

export const readSelectedReviewText = () => {
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

export const selectionKeywordStopwords = new Set([
    'the', 'and', 'that', 'this', 'with', 'from', 'into', 'your', 'their', 'there', 'about', 'would', 'could',
    'should', 'have', 'has', 'had', 'were', 'was', 'been', 'being', 'while', 'where', 'when', 'which', 'what',
    'why', 'then', 'than', 'them', 'they', 'those', 'these', 'just', 'also', 'only', 'more', 'most', 'very',
    'much', 'many', 'some', 'such', 'over', 'under', 'after', 'before', 'because', 'through', 'during', 'between',
    'each', 'other', 'another', 'into', 'onto', 'upon', 'across', 'around', 'within', 'without', 'against', 'among',
    'people', 'person', 'writer', 'passage', 'question', 'answer', 'student', 'selected', 'choose',
    'mình', 'bạn', 'đang', 'đoạn', 'chọn', 'này', 'kia', 'được', 'trong', 'ngoài', 'cũng', 'nhưng', 'hoặc', 'với',
    'của', 'cho', 'nên', 'rằng', 'đây', 'đó', 'khi', 'nếu', 'thì', 'để', 'một', 'những', 'các',
]);

export const extractSelectionKeywords = (selectedText: string) => {
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

export const inferListeningQuestionNumberFromContextText = ({
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
