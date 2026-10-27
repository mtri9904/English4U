import type { PracticeSessionDto, PracticeSessionSpeakingAnalyticsDto } from '../../types/session.types';

export const formatSeconds = (value?: number | null) => {
    if (value == null) {
        return 'Không giới hạn';
    }

    const total = Math.max(0, value);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export const statusColorMap: Record<string, string> = {
    NotStarted: 'default',
    InProgress: 'processing',
    Submitted: 'warning',
    Completed: 'success',
    Abandoned: 'error',
};

export const speakingPaceLabelMap: Record<NonNullable<PracticeSessionSpeakingAnalyticsDto['paceLabel']>, string> = {
    insufficient_data: 'Chưa đủ dữ liệu pace',
    slow: 'Pace chậm',
    balanced: 'Pace cân bằng',
    fast: 'Pace nhanh',
    very_fast: 'Pace quá nhanh',
};

export const speakingCoverageLabelMap: Record<NonNullable<PracticeSessionSpeakingAnalyticsDto['coverageLabel']>, string> = {
    insufficient_data: 'Chưa đủ dữ liệu độ dài',
    too_short: 'Câu trả lời quá ngắn',
    on_target: 'Độ dài đạt mục tiêu',
    exceeds_target: 'Thời lượng vượt mục tiêu',
};

export const getAnalyticsTagColor = (label?: string | null) => {
    switch (label) {
        case 'balanced':
        case 'on_target':
            return 'success';
        case 'fast':
            return 'processing';
        case 'slow':
        case 'too_short':
        case 'very_fast':
        case 'exceeds_target':
            return 'warning';
        default:
            return 'default';
    }
};

export const formatPercent = (value?: number | null) => (
    value == null ? '—' : `${Math.round(value * 100)}%`
);

export const getAudioQualityColor = (label?: string | null) => {
    switch (label) {
        case 'usable':
            return 'success';
        case 'usable_with_warnings':
            return 'warning';
        case 'technical_low_confidence':
        case 'empty':
            return 'error';
        default:
            return 'default';
    }
};

export const audioQualityLabelMap: Record<string, string> = {
    usable: 'Âm thanh tốt',
    usable_with_warnings: 'Có tạp âm nhẹ',
    technical_low_confidence: 'Không rõ tiếng',
    empty: 'Không phát hiện giọng nói',
};

export const criteriaNameMap: Record<string, string> = {
    'Fluency and Coherence': 'Độ trôi chảy & Mạch lạc',
    'Grammatical Range and Accuracy': 'Sử dụng Ngữ pháp',
    'Lexical Resource': 'Vốn từ vựng',
    'Pronunciation': 'Phát âm',
};

export const formatEvidenceItem = (item: string): string | null => {
    const parts = item.split('=');
    if (parts.length < 2) {
        if (item.includes('pauses=')) {
            const pausesMatch = item.match(/pauses=(\d+)/);
            const longPausesMatch = item.match(/long_pauses=(\d+)/);
            const totalPauseMatch = item.match(/total_pause=([\d.]+s?)/);
            const pauses = pausesMatch ? pausesMatch[1] : '0';
            const longPauses = longPausesMatch ? longPausesMatch[1] : '0';
            const totalPause = totalPauseMatch ? totalPauseMatch[1] : '0s';
            return `Ngắt quãng: ${pauses} lần (Dừng dài: ${longPauses}, Tổng dừng: ${totalPause})`;
        }
        return null;
    }

    const key = parts[0].trim();
    const value = parts.slice(1).join('=').trim();

    switch (key) {
        case 'word_count':
            return `Số từ: ${value}`;
        case 'wpm':
            return `Tốc độ: ${value} từ/phút`;
        case 'speech_ratio':
            return `Tỷ lệ nói: ${value}`;
        case 'sentence_units':
            return `Số câu: ${value}`;
        case 'avg_words_per_unit':
            return `Số từ TB/câu: ${value}`;
        case 'connector_count':
            return `Từ nối đã dùng: ${value}`;
        case 'complex_sentence_ratio':
            return `Tỷ lệ câu phức: ${value}`;
        case 'grammar_complexity_score': {
            const num = parseFloat(value);
            return isNaN(num) ? `Độ phức tạp ngữ pháp: ${value}` : `Độ phức tạp ngữ pháp: ${Math.round(num * 100)}%`;
        }
        case 'tense_marker_variety':
            return `Độ đa dạng thì: ${value}/12`;
        case 'filler_ratio':
            return `Tỷ lệ từ đệm (uh/um): ${value}`;
        case 'subordinate_clause_markers':
            return `Mệnh đề phụ thuộc: ${value}`;
        case 'modal_verbs':
            return `Động từ khuyết thiếu: ${value}`;
        case 'unique_word_ratio':
            return `Từ vựng đa dạng: ${value}`;
        case 'repetition_ratio':
            return `Tỷ lệ lặp từ: ${value}`;
        case 'lexical_density':
            return `Mật độ từ thực (lexical): ${value}`;
        case 'asr_confidence':
            return `Độ chuẩn phát âm: ${value}`;
        case 'low_confidence_word_ratio':
            return `Phát âm chưa chuẩn: ${value}`;
        default:
            return null;
    }
};

export const getLowConfidenceWords = (speakingAnalytics?: PracticeSessionSpeakingAnalyticsDto | null) => (
    (speakingAnalytics?.wordTimestamps ?? [])
        .filter((word) => word.probability != null && word.probability < 0.65)
        .slice(0, 8)
);

export interface SpeakingPromptEntry {
    sectionTitle: string | null;
    partId: string;
    partNumber?: number | null;
    partDescription?: string | null;
    question: any;
    promptIndex: number;
}

export const getSpeakingPromptEntries = (session: PracticeSessionDto): SpeakingPromptEntry[] => (
    session.exam.sections.flatMap((section) =>
        section.speakingParts.flatMap((part) =>
            [...part.questions]
                .sort((left, right) => (left.orderIndex ?? 0) - (right.orderIndex ?? 0))
                .map((question, index) => ({
                    sectionTitle: section.title,
                    partId: part.id,
                    partNumber: part.partNumber,
                    partDescription: part.description,
                    question,
                    promptIndex: index + 1,
                })),
        ),
    )
);

