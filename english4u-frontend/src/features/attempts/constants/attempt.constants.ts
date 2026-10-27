import {
    CheckCircle2,
    Clock3,
    PlayCircle,
    XCircle,
} from 'lucide-react';
import type { ElementType } from 'react';

export interface AttemptStatusConfigItem {
    label: string;
    bg: string;
    text: string;
    dot: string;
    icon: ElementType;
}

export const ATTEMPT_STATUS_CONFIG: Record<string, AttemptStatusConfigItem> = {
    Completed: { label: 'Hoàn thành', bg: '#d1fae5', text: '#065f46', dot: '#10b981', icon: CheckCircle2 },
    InProgress: { label: 'Đang thi', bg: '#dbeafe', text: '#1e40af', dot: '#3b82f6', icon: PlayCircle },
    Submitted: { label: 'Đã nộp', bg: '#fef3c7', text: '#92400e', dot: '#f59e0b', icon: CheckCircle2 },
    Abandoned: { label: 'Bỏ dở', bg: '#fee2e2', text: '#991b1b', dot: '#ef4444', icon: XCircle },
    NotStarted: { label: 'Chưa bắt đầu', bg: '#f1f5f9', text: '#475569', dot: '#94a3b8', icon: Clock3 },
};

export const ATTEMPT_SKILL_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
    Reading: { label: 'Reading', bg: '#ede9fe', text: '#6d28d9' },
    Listening: { label: 'Listening', bg: '#dbeafe', text: '#1d4ed8' },
    Writing: { label: 'Writing', bg: '#fef3c7', text: '#92400e' },
    Speaking: { label: 'Speaking', bg: '#fce7f3', text: '#9d174d' },
    FullTest: { label: 'Full Test', bg: '#d1fae5', text: '#065f46' },
};

export const ATTEMPT_STATUS_OPTIONS = [
    { value: 'ALL', label: 'Tất cả trạng thái' },
    { value: 'Completed', label: 'Hoàn thành' },
    { value: 'InProgress', label: 'Đang thi' },
    { value: 'Submitted', label: 'Đã nộp' },
    { value: 'Abandoned', label: 'Bỏ dở' },
    { value: 'NotStarted', label: 'Chưa bắt đầu' },
];

// Aliases for backwards compatibility
export const STATUS_CONFIG = ATTEMPT_STATUS_CONFIG;
export const SKILL_CONFIG = ATTEMPT_SKILL_CONFIG;
export const STATUS_OPTIONS = ATTEMPT_STATUS_OPTIONS;

