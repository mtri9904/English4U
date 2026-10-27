export const SESSION_STATUS_LABEL_MAP: Record<string, string> = {
    NotStarted: 'Chưa bắt đầu',
    InProgress: 'Đang làm bài',
    Submitted: 'Đã nộp',
    Completed: 'Hoàn thành',
    Abandoned: 'Đã hủy',
};

export const WRITING_SUBMIT_MIN_WORDS = 10;

export const WRITING_CRITERIA = [
    'Task Achievement',
    'Coherence and Cohesion',
    'Lexical Resource',
    'Grammatical Range and Accuracy',
] as const;

export const WRITING_CRITERIA_LABELS: Record<string, string> = {
    'Task Achievement': 'Đáp ứng yêu cầu đề bài (TA)',
    'Coherence and Cohesion': 'Tính mạch lạc & liên kết (CC)',
    'Lexical Resource': 'Vốn từ vựng (LR)',
    'Grammatical Range and Accuracy': 'Độ đa dạng & chính xác ngữ pháp (GRA)',
};

export const WRITING_CRITERIA_GUIDE_MAP: Record<string, { desc: string; focus: string }> = {
    'Task Achievement': {
        desc: 'Mức độ trả lời đầy đủ yêu cầu đề bài, phát triển ý tưởng rõ ràng, có dẫn chứng và dữ liệu hỗ trợ.',
        focus: 'Đọc kỹ đề, phân tích đủ tất cả các vế câu hỏi, giữ lập trường nhất quán từ mở bài đến kết bài.',
    },
    'Coherence and Cohesion': {
        desc: 'Tính mạch lạc logic trong cấu trúc bài, phân đoạn hợp lý và sử dụng từ nối tự nhiên, chính xác.',
        focus: 'Mỗi đoạn văn tập trung 1 ý chính (topic sentence), dùng từ nối đa dạng tránh lặp lại máy móc.',
    },
    'Lexical Resource': {
        desc: 'Độ phong phú của vốn từ, khả năng dùng từ đồng nghĩa (paraphrase), collocations và độ chính xác chính tả.',
        focus: 'Dùng từ vựng đúng ngữ cảnh học thuật, paraphrase linh hoạt tránh chép lại đề bài.',
    },
    'Grammatical Range and Accuracy': {
        desc: 'Độ đa dạng của cấu trúc câu (câu phức, câu ghép, mệnh đề quan hệ) và tỷ lệ câu không mắc lỗi ngữ pháp.',
        focus: 'Kết hợp linh hoạt câu đơn và câu phức, kiểm tra kỹ chia động từ, mạo từ và dấu câu.',
    },
};

// Aliases for backwards compatibility
export const statusLabelMap = SESSION_STATUS_LABEL_MAP;
export const writingCriteria = WRITING_CRITERIA;
export const writingCriteriaLabels = WRITING_CRITERIA_LABELS;
export const writingCriteriaGuideMap = WRITING_CRITERIA_GUIDE_MAP;
