import type {
    CopilotContextImagePayload,
    CopilotFocusPayload,
    ReviewCopilotContext,
} from '../types/copilot.types';
import type {
    PracticeSessionAnswerDto,
    PracticeSessionListeningPartDto,
    PracticeSessionReadingPassageDto,
} from '../types/session.types';
import { isObjectiveSkill } from './sessionRouting.utils';
import {
    hasReadingEvidenceLocationIntent,
} from './reviewCopilotSelectionIntent.utils';

// Re-export all submodules for complete backward compatibility
export * from './reviewCopilotSelectionIntent.utils';
export * from './reviewCopilotReplayScope.utils';

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

export const summarizeAnswerValue = (value?: string | null) => {
    const trimmed = (value ?? '').trim();
    if (!trimmed) {
        return 'Chưa làm';
    }

    return trimmed.length > 36 ? `${trimmed.slice(0, 36)}...` : trimmed;
};

export const buildObjectiveWeaknessSummary = ({
    skillType,
    readingPassages,
    listeningParts,
    answerMap,
    reviewAnswerMap,
}: {
    skillType: string;
    readingPassages: PracticeSessionReadingPassageDto[];
    listeningParts: PracticeSessionListeningPartDto[];
    answerMap: Record<string, string>;
    reviewAnswerMap: Record<string, PracticeSessionAnswerDto>;
}) => {
    const normalizedSkill = skillType.trim().toUpperCase();
    const questionItems = normalizedSkill === 'READING'
        ? readingPassages.flatMap((passage) => (
            passage.questionGroups.flatMap((group) => (
                group.questions.map((question) => ({
                    passageOrPartLabel: `Passage ${passage.passageNumber ?? 'N/A'}`,
                    groupType: group.groupType,
                    question,
                    reviewAnswer: reviewAnswerMap[question.id],
                    userAnswer: answerMap[question.id] ?? reviewAnswerMap[question.id]?.answerText,
                }))
            ))
        ))
        : listeningParts.flatMap((part) => (
            part.questionGroups.flatMap((group) => (
                group.questions.map((question) => ({
                    passageOrPartLabel: `Part ${part.partNumber ?? 'N/A'}`,
                    groupType: group.groupType,
                    question,
                    reviewAnswer: reviewAnswerMap[question.id],
                    userAnswer: answerMap[question.id] ?? reviewAnswerMap[question.id]?.answerText,
                }))
            ))
        ));

    const incorrectItems = questionItems.filter((item) => item.reviewAnswer?.isCorrect === false);
    const unattemptedItems = questionItems.filter((item) => item.reviewAnswer?.isCorrect == null && !item.userAnswer?.trim());

    if (incorrectItems.length === 0 && unattemptedItems.length === 0) {
        return [
            `Bạn làm đúng toàn bộ các câu trong bài ${skillType} này!`,
            'Nếu muốn rèn thêm, bạn có thể bấm vào từng câu để xem transcript/passage dẫn chứng hoặc hỏi cách làm nhanh hơn.',
        ].join('\n\n');
    }

    const incorrectGroups = new Map<string, number>();
    incorrectItems.forEach((item) => {
        const key = item.groupType || 'Dạng câu khác';
        incorrectGroups.set(key, (incorrectGroups.get(key) ?? 0) + 1);
    });

    const lines: string[] = [
        `Tổng hợp các điểm cần cải thiện cho bài ${skillType}:`,
        `- Số câu làm sai: ${incorrectItems.length}`,
        unattemptedItems.length > 0 ? `- Số câu chưa làm: ${unattemptedItems.length}` : '',
        '',
        'Các dạng câu đang mất điểm nhiều nhất:',
        ...Array.from(incorrectGroups.entries())
            .sort((left, right) => right[1] - left[1])
            .map(([type, count]) => `+ ${type}: ${count} câu`),
        '',
        'Danh sách câu sai cần ưu tiên xem lại:',
        ...incorrectItems.slice(0, 10).map((item) => {
            const qNum = item.question.questionNumber != null ? `Câu ${item.question.questionNumber}` : 'Câu';
            const userAns = summarizeAnswerValue(item.userAnswer);
            const correctAns = summarizeAnswerValue(item.reviewAnswer?.correctAnswer ?? item.question.correctAnswer);
            return `* ${qNum} (${item.passageOrPartLabel} - ${item.groupType || 'N/A'}): Bạn chọn "${userAns}", đáp án đúng là "${correctAns}".`;
        }),
        incorrectItems.length > 10 ? `* ... và còn ${incorrectItems.length - 10} câu sai khác.` : '',
        '',
        'Gợi ý: Bạn có thể nhập "giải thích câu [số]" hoặc bấm trực tiếp vào câu đó trên danh sách để AI phân tích chi tiết dẫn chứng.',
    ];

    return lines.filter(Boolean).join('\n');
};
