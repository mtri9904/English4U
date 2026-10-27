import { Clock3 } from 'lucide-react';
import {
    ATTEMPT_STATUS_CONFIG,
    ATTEMPT_SKILL_CONFIG,
    type AttemptStatusConfigItem,
} from '../constants/attempt.constants';

/**
 * Định dạng thời lượng (giây) sang dạng mm:ss
 */
export const formatAttemptSeconds = (v?: number | null): string => {
    if (v == null) return 'Không giới hạn';
    const m = Math.floor(Math.max(0, v) / 60);
    const s = Math.max(0, v) % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
};

/**
 * Lấy cấu hình hiển thị trạng thái lượt thi
 */
export const getAttemptStatusMeta = (key: string): AttemptStatusConfigItem =>
    ATTEMPT_STATUS_CONFIG[key] ?? {
        label: key,
        bg: '#f1f5f9',
        text: '#475569',
        dot: '#94a3b8',
        icon: Clock3,
    };

/**
 * Lấy cấu hình hiển thị kỹ năng lượt thi
 */
export const getAttemptSkillMeta = (key: string): { label: string; bg: string; text: string } =>
    ATTEMPT_SKILL_CONFIG[key] ?? { label: key, bg: '#f1f5f9', text: '#64748b' };

// Aliases for backwards compatibility
export const formatSeconds = formatAttemptSeconds;
export const getStatus = getAttemptStatusMeta;
export const getSkill = getAttemptSkillMeta;

