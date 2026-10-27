import React, { ReactNode } from 'react';
import {
    AudioOutlined,
    EditOutlined,
    FileTextOutlined,
    MessageOutlined,
} from '@ant-design/icons';

export const EXAM_TYPE_COLOR_MAP: Record<string, { bg: string; color: string }> = {
    IELTS: { bg: '#ede9fe', color: '#7c3aed' },
};

export const EXAM_SKILL_COLORS: Record<string, string> = {
    Reading: '#10b981',
    Listening: '#6366f1',
    Writing: '#f59e0b',
    Speaking: '#ef4444',
};

export interface SkillTheme {
    color: string;
    soft: string;
    border: string;
    accent: string;
    gradient: string;
    shadow: string;
    icon: ReactNode;
}

export const EXAM_SKILL_THEME_MAP: Record<string, SkillTheme> = {
    READING: {
        color: '#047857',
        soft: 'linear-gradient(135deg, rgba(236, 253, 245, 0.7) 0%, rgba(209, 250, 229, 0.5) 100%)',
        border: 'rgba(167, 243, 208, 0.5)',
        accent: '#059669',
        gradient: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
        shadow: 'rgba(16, 185, 129, 0.15)',
        icon: React.createElement(FileTextOutlined),
    },
    LISTENING: {
        color: '#1d4ed8',
        soft: 'linear-gradient(135deg, rgba(239, 246, 255, 0.7) 0%, rgba(219, 234, 254, 0.5) 100%)',
        border: 'rgba(191, 219, 254, 0.5)',
        accent: '#2563eb',
        gradient: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
        shadow: 'rgba(59, 130, 246, 0.15)',
        icon: React.createElement(AudioOutlined),
    },
    WRITING: {
        color: '#b45309',
        soft: 'linear-gradient(135deg, rgba(255, 251, 235, 0.7) 0%, rgba(254, 243, 199, 0.5) 100%)',
        border: 'rgba(253, 230, 138, 0.5)',
        accent: '#d97706',
        gradient: 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)',
        shadow: 'rgba(245, 158, 11, 0.15)',
        icon: React.createElement(EditOutlined),
    },
    SPEAKING: {
        color: '#b91c1c',
        soft: 'linear-gradient(135deg, rgba(254, 242, 242, 0.7) 0%, rgba(254, 226, 226, 0.5) 100%)',
        border: 'rgba(254, 202, 202, 0.5)',
        accent: '#dc2626',
        gradient: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
        shadow: 'rgba(239, 68, 68, 0.15)',
        icon: React.createElement(MessageOutlined),
    },
};

export const EXAM_SKILL_META: Record<string, { icon: ReactNode; color: string }> = {
    READING: { icon: React.createElement(FileTextOutlined), color: '#10b981' },
    LISTENING: { icon: React.createElement(AudioOutlined), color: '#3b82f6' },
    WRITING: { icon: React.createElement(EditOutlined), color: '#f59e0b' },
    SPEAKING: { icon: React.createElement(MessageOutlined), color: '#ef4444' },
};

export const EXAM_SKILL_THEME_META: Record<string, {
    color: string;
    bgGradient: string;
    lightBg: string;
    btnGradient: string;
    glowShadow: string;
}> = {
    READING: {
        color: '#10b981',
        bgGradient: 'linear-gradient(135deg, #f0fdf4 0%, #ffffff 50%, #fafafa 100%)',
        lightBg: '#f0fdf4',
        btnGradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        glowShadow: '0 8px 20px rgba(16, 185, 129, 0.25)',
    },
    LISTENING: {
        color: '#3b82f6',
        bgGradient: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 50%, #fafafa 100%)',
        lightBg: '#eff6ff',
        btnGradient: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
        glowShadow: '0 8px 20px rgba(59, 130, 246, 0.25)',
    },
    WRITING: {
        color: '#f59e0b',
        bgGradient: 'linear-gradient(135deg, #fffbeb 0%, #ffffff 50%, #fafafa 100%)',
        lightBg: '#fffbeb',
        btnGradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
        glowShadow: '0 8px 20px rgba(245, 158, 11, 0.25)',
    },
    SPEAKING: {
        color: '#ef4444',
        bgGradient: 'linear-gradient(135deg, #fef2f2 0%, #ffffff 50%, #fafafa 100%)',
        lightBg: '#fef2f2',
        btnGradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
        glowShadow: '0 8px 20px rgba(239, 68, 68, 0.25)',
    },
};

export const EXAM_SESSION_STATUS_COLOR_MAP: Record<string, string> = {
    NotStarted: 'default',
    InProgress: 'processing',
    Submitted: 'warning',
    Completed: 'success',
    Abandoned: 'error',
};

export const EXAM_SESSION_STATUS_LABEL_MAP: Record<string, string> = {
    NotStarted: 'Chưa bắt đầu',
    InProgress: 'Đang làm',
    Submitted: 'Đã nộp',
    Completed: 'Hoàn thành',
    Abandoned: 'Đã bỏ',
};

export const MY_EXAMS_SKILL_THEME_MAP: Record<string, { color: string; bg: string; border: string }> = {
    READING: { color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' },
    LISTENING: { color: '#4f46e5', bg: '#eef2ff', border: '#c7d2fe' },
    WRITING: { color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
    SPEAKING: { color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
};

export const EXAM_SKILL_FILTER_OPTIONS = [
    { label: 'Tất cả', value: 'ALL' },
    { label: 'Reading', value: 'READING' },
    { label: 'Listening', value: 'LISTENING' },
    { label: 'Writing', value: 'WRITING' },
    { label: 'Speaking', value: 'SPEAKING' },
];

export const EXAM_STATUS_FILTER_OPTIONS = [
    { label: 'Tất cả', value: 'ALL' },
    { label: 'Đang làm', value: 'InProgress' },
    { label: 'Đã nộp', value: 'Submitted' },
    { label: 'Hoàn thành', value: 'Completed' },
    { label: 'Đã bỏ', value: 'Abandoned' },
];

// Aliases for backwards compatibility
export const examTypeColorMap = EXAM_TYPE_COLOR_MAP;
export const skillColors = EXAM_SKILL_COLORS;
export const skillThemeMap = EXAM_SKILL_THEME_MAP;
export const skillMeta = EXAM_SKILL_META;
export const skillThemeMeta = EXAM_SKILL_THEME_META;
export const examStatusColorMap = EXAM_SESSION_STATUS_COLOR_MAP;
export const examStatusLabelMap = EXAM_SESSION_STATUS_LABEL_MAP;
export const myExamsSkillThemeMap = MY_EXAMS_SKILL_THEME_MAP;
export const skillFilterOptions = EXAM_SKILL_FILTER_OPTIONS;
export const statusFilterOptions = EXAM_STATUS_FILTER_OPTIONS;
