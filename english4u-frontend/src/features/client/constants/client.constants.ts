import React from 'react';
import {
    BookOutlined,
    FireOutlined,
    ReadOutlined,
    SoundOutlined,
} from '@ant-design/icons';

export const WEEKLY_GOAL = 5;
export const CLIENT_SKILLS = ['READING', 'LISTENING', 'WRITING', 'SPEAKING'] as const;
export type ClientSkillKey = (typeof CLIENT_SKILLS)[number];

export const CLIENT_PALETTE = {
    bg: '#F9FAFB',
    ink: '#111827',
    muted: '#6B7280',
    border: 'rgba(148, 163, 184, 0.22)',
    card: 'rgba(255, 255, 255, 0.76)',
    indigo: '#4F46E5',
    blue: '#2563EB',
    green: '#16A34A',
    orange: '#F97316',
    cyan: '#0891B2',
    amber: '#F59E0B',
    rose: '#E11D48',
};

export const CLIENT_SKILL_META: Record<ClientSkillKey, {
    label: string;
    shortLabel: string;
    color: string;
    tint: string;
    icon: React.ReactNode;
}> = {
    READING: {
        label: 'Reading',
        shortLabel: 'Đọc',
        color: '#2563EB',
        tint: '#EFF6FF',
        icon: React.createElement(ReadOutlined),
    },
    LISTENING: {
        label: 'Listening',
        shortLabel: 'Nghe',
        color: '#7C3AED',
        tint: '#F5F3FF',
        icon: React.createElement(SoundOutlined),
    },
    WRITING: {
        label: 'Writing',
        shortLabel: 'Viết',
        color: '#D97706',
        tint: '#FFF7ED',
        icon: React.createElement(BookOutlined),
    },
    SPEAKING: {
        label: 'Speaking',
        shortLabel: 'Nói',
        color: '#16A34A',
        tint: '#F0FDF4',
        icon: React.createElement(FireOutlined),
    },
};

export const CLIENT_CARD_MOTION = {
    whileHover: { y: -4 },
    transition: { duration: 0.18 },
};

export const CLIENT_STATUS_LABEL_MAP: Record<string, string> = {
    NotStarted: 'Chưa bắt đầu',
    InProgress: 'Đang làm',
    Submitted: 'Đã nộp',
    Completed: 'Hoàn thành',
    Abandoned: 'Đã hủy',
};

// Aliases for backwards compatibility
export const palette = CLIENT_PALETTE;
export const skillMeta = CLIENT_SKILL_META;
export const cardMotion = CLIENT_CARD_MOTION;
export const statusLabelMap = CLIENT_STATUS_LABEL_MAP;
export const SKILLS = CLIENT_SKILLS;
export type SkillKey = ClientSkillKey;

