import {
    NOTIFICATION_ROLE_OPTIONS,
    NOTIFICATION_ROLE_STYLE,
    type RoleFilter,
} from '../constants/notification.constants';

/**
 * Normalize role value to valid RoleFilter
 */
export const resolveRole = (role: string): RoleFilter => {
    return NOTIFICATION_ROLE_OPTIONS.some(o => o.value === role) ? (role as RoleFilter) : 'ALL';
};

/**
 * Generate avatar initials from user display name
 */
export const avatarChar = (name: string): string => {
    return (name || 'N').trim().charAt(0).toUpperCase();
};

/**
 * Get style configuration by role
 */
export const roleStyle = (role: string): { bg: string; color: string; label: string } => {
    return NOTIFICATION_ROLE_STYLE[role] ?? { bg: '#f1f5f9', color: '#475569', label: role };
};

