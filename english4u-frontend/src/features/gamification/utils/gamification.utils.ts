import React from 'react';
import { FireFilled, FireOutlined } from '@ant-design/icons';
import type { PracticeSessionListItemDto } from '@/features/exam-taking';
import {
    PROGRESS_SKILL_META,
    type ProgressSkillKey,
} from '../constants/gamification.constants';

export interface StreakDisplayMeta {
    title: string;
    shortTitle: string;
    description: string;
    icon: React.ReactNode;
    accent: string;
    iconColor: string;
    iconBackground: string;
    background: string;
    borderColor: string;
    shadow: string;
}

/**
 * Tính toán metadata hiển thị chuỗi ngày học liên tục (streak)
 */
export const getStreakDisplayMeta = (streak: number): StreakDisplayMeta => {
    const safeStreak = Math.max(0, Math.floor(streak));

    if (safeStreak >= 30) {
        return {
            title: `Chuỗi ${safeStreak} ngày`,
            shortTitle: `${safeStreak} Day Streak`,
            description: 'Chuỗi học rất mạnh. Giữ nhịp hôm nay để bảo toàn phong độ.',
            icon: React.createElement(FireFilled),
            accent: '#dc2626',
            iconColor: '#fff7ed',
            iconBackground: 'linear-gradient(135deg, #dc2626 0%, #f97316 58%, #facc15 100%)',
            background: 'linear-gradient(135deg, #fff1f2 0%, #ffedd5 52%, #fef3c7 100%)',
            borderColor: '#fed7aa',
            shadow: '0 14px 30px rgba(220, 38, 38, 0.24)',
        };
    }

    if (safeStreak >= 14) {
        return {
            title: `Chuỗi ${safeStreak} ngày`,
            shortTitle: `${safeStreak} Day Streak`,
            description: 'Phong độ rất tốt. Tiếp tục hoàn thành bài mỗi ngày để tăng streak.',
            icon: React.createElement(FireFilled),
            accent: '#ea580c',
            iconColor: '#fff7ed',
            iconBackground: 'linear-gradient(135deg, #ea580c 0%, #f97316 64%, #fbbf24 100%)',
            background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
            borderColor: '#fed7aa',
            shadow: '0 12px 26px rgba(234, 88, 12, 0.22)',
        };
    }

    if (safeStreak >= 7) {
        return {
            title: `Chuỗi ${safeStreak} ngày`,
            shortTitle: `${safeStreak} Day Streak`,
            description: 'Bạn đang vào nhịp tốt. Đừng ngắt quãng chuỗi học nhé.',
            icon: React.createElement(FireFilled),
            accent: '#f59e0b',
            iconColor: '#fffbeb',
            iconBackground: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
            background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
            borderColor: '#fde68a',
            shadow: '0 10px 22px rgba(245, 158, 11, 0.2)',
        };
    }

    if (safeStreak > 0) {
        return {
            title: `Chuỗi ${safeStreak} ngày`,
            shortTitle: `${safeStreak} Day Streak`,
            description: 'Khởi đầu tích cực. Duy trì bài học mỗi ngày để tạo đà bứt phá.',
            icon: React.createElement(FireFilled),
            accent: '#3b82f6',
            iconColor: '#eff6ff',
            iconBackground: 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)',
            background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
            borderColor: '#bfdbfe',
            shadow: '0 10px 22px rgba(59, 130, 246, 0.2)',
        };
    }

    return {
        title: 'Chưa có chuỗi ngày học',
        shortTitle: 'Chưa có chuỗi',
        description: 'Hoàn thành bài luyện tập hoặc đề thi hôm nay để kích hoạt streak đầu tiên.',
        icon: React.createElement(FireOutlined),
        accent: '#94a3b8',
        iconColor: '#475569',
        iconBackground: '#e2e8f0',
        background: '#f8fafc',
        borderColor: '#e2e8f0',
        shadow: 'none',
    };
};

/**
 * Lấy skill key hợp lệ cho bảng thống kê tiến độ
 */
export const getSkillKey = (value?: string | null): ProgressSkillKey => {
    const normalized = (value ?? '').trim().toUpperCase();
    return normalized in PROGRESS_SKILL_META ? (normalized as ProgressSkillKey) : 'READING';
};

/**
 * Kiểm tra phiên thi đã hoàn thành hoặc nộp bài chưa
 */
export const isFinished = (session: PracticeSessionListItemDto): boolean =>
    session.status === 'Completed' || session.status === 'Submitted';

/**
 * Lấy điểm số bài thi (band score)
 */
export const getSessionScore = (session: PracticeSessionListItemDto): number | null =>
    session.totalBandScore ?? session.writingScore ?? session.speakingScore ?? null;

/**
 * Chuyển đổi timestamp ISO sang milliseconds
 */
export const parseDateMs = (value?: string | null): number => {
    if (!value) return 0;
    const ts = Date.parse(value);
    return Number.isFinite(ts) ? ts : 0;
};

/**
 * Tính số phút làm bài thi
 */
export const getDurationMinutes = (session: PracticeSessionListItemDto): number => {
    const start = parseDateMs(session.startedAt);
    const end = parseDateMs(session.endedAt);
    if (start <= 0 || end <= start) return 0;
    return Math.max(1, Math.round((end - start) / 60000));
};

/**
 * Định dạng ngày ngắn DD/MM
 */
export const formatShortDate = (value?: string | null): string => {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
};

/**
 * Lời khuyên học tập tự động theo thang điểm trung bình
 */
export const getAiAdvice = (skill: string, avgBand: number | null): string => {
    if (avgBand === null) return 'Hãy hoàn thành bài thi thử đầu tiên để nhận đánh giá chi tiết từ trợ lý học tập.';

    if (avgBand < 5.0) {
        return 'Tập trung học từ vựng học thuật cơ bản và luyện tập các chủ đề quen thuộc hàng ngày.';
    }
    if (avgBand < 6.0) {
        if (skill === 'READING' || skill === 'LISTENING') return 'Luyện tập phương pháp Skimming và Scanning để tăng tốc độ tìm ý chính.';
        return 'Học cách mở rộng câu phức và cấu trúc ngữ pháp mạch lạc cho bài nói/viết.';
    }
    if (avgBand < 7.0) {
        if (skill === 'READING' || skill === 'LISTENING') return 'Tập trung luyện các câu hỏi khó như Headings và Multiple Choice.';
        return 'Tập trung nâng cấp từ vựng chuyên sâu (collocations) và phân bổ lập luận chặt chẽ.';
    }
    return 'Duy trì phong độ làm đề nâng cao, tối ưu hóa các lỗi diễn đạt nhỏ để hướng tới band điểm tối đa.';
};

