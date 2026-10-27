import type { ExamDto, PracticeExamListItemDto, PracticeExamDetailDto, PracticeExamSectionSummaryDto } from '../types/exam.types';
import type { PracticeSessionListItemDto } from '@/features/exam-taking';
import {
    EXAM_SKILL_THEME_MAP,
    MY_EXAMS_SKILL_THEME_MAP,
    type SkillTheme,
} from '../constants/exam.constants';

/**
 * Lấy theme màu sắc cho thẻ đề thi trong MyExamsPage
 */
export const getMyExamsSkillTheme = (skillType?: string | null): { color: string; bg: string; border: string } => (
    MY_EXAMS_SKILL_THEME_MAP[normalizeSkillToken(skillType)] ?? { color: '#0f172a', bg: '#f8fafc', border: '#e2e8f0' }
);

/**
 * Chuẩn hóa chuỗi kỹ năng (loại bỏ khoảng trắng, viết hoa)
 */
export const normalizeSkillToken = (value?: string | null): string =>
    (value ?? '').trim().toUpperCase();

/**
 * Định dạng nhãn kỹ năng (Capitalize chữ đầu: "Reading", "Listening", ...)
 */
export const formatSkillLabel = (value?: string | null): string => {
    const normalized = (value ?? '').trim().toLowerCase();
    if (!normalized) return '';
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

/**
 * Lấy kỹ năng chính của đề thi (Admin)
 */
export const getPrimarySkill = (exam: ExamDto): string => {
    const firstSkill = exam.skillTypes?.find((skill) => skill?.trim());
    if (firstSkill) return formatSkillLabel(firstSkill);
    return formatSkillLabel(exam.sections?.[0]?.skillType);
};

/**
 * Lấy kỹ năng chính của đề thi trong danh mục luyện tập (Client)
 */
export const getCatalogPrimarySkill = (exam: PracticeExamListItemDto): string => {
    const firstSkill = exam.skillTypes.find((skill) => normalizeSkillToken(skill).length > 0);
    if (firstSkill) return normalizeSkillToken(firstSkill);
    if ((exam.readingQuestionCount ?? 0) > 0) return 'READING';
    if ((exam.listeningQuestionCount ?? 0) > 0) return 'LISTENING';
    if ((exam.writingTaskCount ?? 0) > 0) return 'WRITING';
    if ((exam.speakingPartCount ?? 0) > 0) return 'SPEAKING';
    return '';
};

export const getDetailPrimarySkill = (exam: PracticeExamDetailDto): string => {
    const firstSkill = exam.skillTypes.find((skill) => normalizeSkillToken(skill).length > 0);
    if (firstSkill) return normalizeSkillToken(firstSkill);
    const firstSectionSkill = exam.sections.find((section) => normalizeSkillToken(section.skillType).length > 0)?.skillType;
    return normalizeSkillToken(firstSectionSkill);
};

export const getPrimarySectionStats = (section?: PracticeExamSectionSummaryDto | null): Array<{ label: string; value: string | number }> => {
    if (!section) return [];

    switch (normalizeSkillToken(section.skillType)) {
        case 'READING':
            return [
                { label: 'Passage', value: section.readingPassageCount },
                { label: 'Nhóm câu hỏi', value: section.questionGroupCount },
                { label: 'Tổng câu', value: section.questionCount },
            ];
        case 'LISTENING':
            return [
                { label: 'Part', value: section.listeningPartCount },
                { label: 'Nhóm câu hỏi', value: section.questionGroupCount },
                { label: 'Tổng câu', value: section.questionCount },
            ];
        case 'WRITING':
            return [
                { label: 'Task', value: section.writingTaskCount },
                { label: 'Band', value: '0-9' },
                { label: 'Kỹ năng', value: 'Viết học thuật' },
            ];
        case 'SPEAKING':
            return [
                { label: 'Part', value: section.speakingPartCount },
                { label: 'Prompt', value: section.speakingQuestionCount },
                { label: 'Band', value: '0-9' },
            ];
        default:
            return [
                { label: 'Nhóm câu hỏi', value: section.questionGroupCount },
                { label: 'Tổng câu', value: section.questionCount },
            ];
    }
};

export const getExamVolume = (exam: PracticeExamListItemDto, skill: string): { label: string; value: string } => {
    switch (normalizeSkillToken(skill)) {
        case 'READING':
            return { label: 'Số câu hỏi', value: `${exam.readingQuestionCount || 0} câu` };
        case 'LISTENING':
            return { label: 'Số câu hỏi', value: `${exam.listeningQuestionCount || 0} câu` };
        case 'WRITING':
            return { label: 'Số task', value: `${exam.writingTaskCount || 0} task` };
        case 'SPEAKING':
            return { label: 'Số part', value: `${exam.speakingPartCount || 0} part` };
        default:
            return { label: 'Nội dung', value: 'Đang cập nhật' };
    }
};

/**
 * Lấy cấu hình giao diện theo kỹ năng đề thi
 */
export const getSkillTheme = (skill: string): SkillTheme => (
    EXAM_SKILL_THEME_MAP[normalizeSkillToken(skill)] ?? {
        color: '#334155',
        soft: 'linear-gradient(135deg, rgba(248, 250, 252, 0.7) 0%, rgba(241, 245, 249, 0.5) 100%)',
        border: 'rgba(226, 232, 240, 0.5)',
        accent: '#475569',
        gradient: 'linear-gradient(135deg, #475569 0%, #64748b 100%)',
        shadow: 'rgba(100, 116, 139, 0.1)',
        icon: null,
    }
);

/**
 * Lấy điểm band tổng hoặc điểm kỹ năng của phiên làm bài
 */
export const getSessionBandScore = (session: PracticeSessionListItemDto): number | null =>
    session.totalBandScore
    ?? session.writingScore
    ?? session.speakingScore
    ?? null;

/**
 * Lấy timestamp bắt đầu phiên thi dạng milliseconds
 */
export const getSessionStartedAtMs = (session: PracticeSessionListItemDto): number => {
    const timestamp = Date.parse(session.startedAt);
    return Number.isFinite(timestamp) ? timestamp : 0;
};

/**
 * Lọc giữ lại phiên thi Speaking mới nhất cho từng đề thi
 */
export const keepLatestSpeakingSessionPerExam = (
    sessions: PracticeSessionListItemDto[]
): PracticeSessionListItemDto[] => {
    const latestSpeakingByExamId = new Map<string, PracticeSessionListItemDto>();
    const result: PracticeSessionListItemDto[] = [];

    sessions.forEach((session) => {
        if (normalizeSkillToken(session.skillType) !== 'SPEAKING') {
            result.push(session);
            return;
        }

        const currentLatest = latestSpeakingByExamId.get(session.examId);
        if (!currentLatest || getSessionStartedAtMs(session) > getSessionStartedAtMs(currentLatest)) {
            latestSpeakingByExamId.set(session.examId, session);
        }
    });

    result.push(...latestSpeakingByExamId.values());
    return result.sort((left, right) => getSessionStartedAtMs(right) - getSessionStartedAtMs(left));
};
