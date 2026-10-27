import type { PracticeSessionListItemDto } from '@/features/exam-taking';
import {
    CLIENT_SKILLS,
    type ClientSkillKey,
} from '../constants/client.constants';

export const fadeIn = (delay = 0) => ({
    initial: { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.34, delay },
});

export const parseDateMs = (value?: string | null): number => {
    if (!value) return 0;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : 0;
};

export const getSkillKey = (value?: string | null): ClientSkillKey => {
    const normalized = (value ?? '').trim().toUpperCase();
    return CLIENT_SKILLS.includes(normalized as ClientSkillKey) ? (normalized as ClientSkillKey) : 'READING';
};

export const isFinishedSession = (session: PracticeSessionListItemDto): boolean =>
    session.status === 'Completed' || session.status === 'Submitted';

export const getSessionBandScore = (session: PracticeSessionListItemDto): number | null =>
    session.totalBandScore
    ?? session.writingScore
    ?? session.speakingScore
    ?? null;

export const formatBand = (value?: number | null): string => (
    value != null ? value.toFixed(1) : '-'
);

export const formatShortDate = (value?: string | null): string => {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';

    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
};

export const getFirstName = (displayName?: string | null): string => {
    const trimmed = displayName?.trim();
    if (!trimmed) return 'bạn';

    return trimmed.split(/\s+/)[0];
};

export const getSessionDurationMinutes = (session: PracticeSessionListItemDto): number => {
    const startedAtMs = parseDateMs(session.startedAt);
    const endedAtMs = parseDateMs(session.endedAt);
    if (startedAtMs <= 0 || endedAtMs <= startedAtMs) return 0;

    return Math.max(1, Math.round((endedAtMs - startedAtMs) / 60000));
};

export const formatMinutes = (minutes: number): string => {
    if (minutes <= 0) return '0 phút';
    if (minutes < 60) return `${minutes} phút`;

    const hours = Math.floor(minutes / 60);
    const remain = minutes % 60;
    return remain > 0 ? `${hours} giờ ${remain} phút` : `${hours} giờ`;
};

