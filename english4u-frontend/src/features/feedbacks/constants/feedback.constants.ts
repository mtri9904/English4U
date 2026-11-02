import {
    Bug,
    Sparkles,
    HelpCircle,
    MoreHorizontal,
    ArrowDown,
    Equal,
    ArrowUp,
    AlertTriangle,
    type LucideIcon,
} from 'lucide-react';
import type { FeedbackType, FeedbackPriority, FeedbackStatus } from '../types/feedback.types';

export const FEEDBACK_TYPES: Record<
    FeedbackType,
    {
        label: string;
        description: string;
        color: string;
        badgeColor: string;
        borderColor: string;
        bgLight: string;
        icon: LucideIcon;
    }
> = {
    BUG: {
        label: 'Sự cố / Lỗi',
        description: 'Chức năng hoạt động sai hoặc gặp lỗi',
        color: '#ef4444',
        badgeColor: 'bg-red-500/10 text-red-400 border-red-500/20',
        borderColor: '#ef4444',
        bgLight: 'rgba(239, 68, 68, 0.1)',
        icon: Bug,
    },
    IMPROVEMENT: {
        label: 'Đề xuất cải tiến',
        description: 'Gợi ý tính năng mới hoặc nâng cấp giao diện',
        color: '#f59e0b',
        badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        borderColor: '#f59e0b',
        bgLight: 'rgba(245, 158, 11, 0.1)',
        icon: Sparkles,
    },
    QUESTION: {
        label: 'Câu hỏi / Thắc mắc',
        description: 'Thắc mắc về cách sử dụng hoặc nội dung bài học',
        color: '#0ea5e9',
        badgeColor: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
        borderColor: '#0ea5e9',
        bgLight: 'rgba(14, 165, 233, 0.1)',
        icon: HelpCircle,
    },
    OTHER: {
        label: 'Khác',
        description: 'Ý kiến đóng góp khác cho English4U',
        color: '#94a3b8',
        badgeColor: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
        borderColor: '#94a3b8',
        bgLight: 'rgba(148, 163, 184, 0.1)',
        icon: MoreHorizontal,
    },
};

export const FEEDBACK_PRIORITIES: Record<
    FeedbackPriority,
    {
        label: string;
        color: string;
        badgeColor: string;
        borderColor: string;
        bgLight: string;
        icon: LucideIcon;
    }
> = {
    LOW: {
        label: 'Thấp',
        color: '#94a3b8',
        badgeColor: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
        borderColor: '#94a3b8',
        bgLight: 'rgba(148, 163, 184, 0.12)',
        icon: ArrowDown,
    },
    MEDIUM: {
        label: 'Trung bình',
        color: '#f59e0b',
        badgeColor: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
        borderColor: '#f59e0b',
        bgLight: 'rgba(245, 158, 11, 0.12)',
        icon: Equal,
    },
    HIGH: {
        label: 'Cao',
        color: '#f97316',
        badgeColor: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
        borderColor: '#f97316',
        bgLight: 'rgba(249, 115, 22, 0.12)',
        icon: ArrowUp,
    },
    URGENT: {
        label: 'Khẩn cấp',
        color: '#ef4444',
        badgeColor: 'bg-red-500/15 text-red-300 border-red-500/30',
        borderColor: '#ef4444',
        bgLight: 'rgba(239, 68, 68, 0.12)',
        icon: AlertTriangle,
    },
};

export const FEEDBACK_STATUSES: Record<
    FeedbackStatus,
    {
        label: string;
        color: string;
        dotColor: string;
        badgeClass: string;
        tagColor: string;
    }
> = {
    RECEIVED: {
        label: 'Đã ghi nhận',
        color: '#94a3b8',
        dotColor: '#94a3b8',
        badgeClass: 'bg-slate-700/60 text-slate-300 border-slate-600',
        tagColor: 'default',
    },
    IN_PROGRESS: {
        label: 'Đang xử lý',
        color: '#3b82f6',
        dotColor: '#3b82f6',
        badgeClass: 'bg-blue-900/40 text-blue-300 border-blue-500/40',
        tagColor: 'processing',
    },
    RESOLVED: {
        label: 'Đã xử lý',
        color: '#10b981',
        dotColor: '#10b981',
        badgeClass: 'bg-emerald-900/40 text-emerald-300 border-emerald-500/40',
        tagColor: 'success',
    },
    REJECTED: {
        label: 'Từ chối',
        color: '#f43f5e',
        dotColor: '#f43f5e',
        badgeClass: 'bg-rose-900/40 text-rose-300 border-rose-500/40',
        tagColor: 'error',
    },
};

export const formatMediaUrl = (url: string | null | undefined): string => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:')) {
        return url;
    }
    const apiBase = (import.meta as any).env.VITE_API_BASE_URL || 'http://localhost:5000/api';
    const serverOrigin = apiBase.replace(/\/api\/?$/, '');
    return `${serverOrigin}${url.startsWith('/') ? '' : '/'}${url}`;
};

