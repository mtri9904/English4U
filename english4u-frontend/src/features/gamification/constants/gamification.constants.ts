import React from 'react';
import {
    BookOutlined,
    FireOutlined,
    ReadOutlined,
    SoundOutlined,
} from '@ant-design/icons';

export const RANK_COLORS = [
    'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', // 🥇
    'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)', // 🥈
    'linear-gradient(135deg, #cd7f32 0%, #a0522d 100%)', // 🥉
];

export const LEVEL_COLORS = [
    '#6366f1',
    '#06b6d4',
    '#10b981',
    '#f59e0b',
    '#ef4444',
    '#8b5cf6',
    '#ec4899',
];

export const PROGRESS_PALETTE = {
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
    purple: '#7C3AED',
    rose: '#E11D48',
};

export const PROGRESS_SKILL_META = {
    READING: {
        label: 'Reading',
        color: '#2563EB',
        tint: '#EFF6FF',
        icon: React.createElement(ReadOutlined),
    },
    LISTENING: {
        label: 'Listening',
        color: '#7C3AED',
        tint: '#F5F3FF',
        icon: React.createElement(SoundOutlined),
    },
    WRITING: {
        label: 'Writing',
        color: '#D97706',
        tint: '#FFF7ED',
        icon: React.createElement(BookOutlined),
    },
    SPEAKING: {
        label: 'Speaking',
        color: '#16A34A',
        tint: '#F0FDF4',
        icon: React.createElement(FireOutlined),
    },
};

export type ProgressSkillKey = keyof typeof PROGRESS_SKILL_META;

// Aliases for backwards compatibility
export const palette = PROGRESS_PALETTE;
export const skillMeta = PROGRESS_SKILL_META;

