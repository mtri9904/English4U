import {
    NOTIFICATION_ROLE_OPTIONS,
    NOTIFICATION_ROLE_STYLE,
    type RoleFilter,
} from '../constants/notification.constants';

/**
 * Chuẩn hóa giá trị role về RoleFilter hợp lệ
 */
export const resolveRole = (role: string): RoleFilter => {
    return NOTIFICATION_ROLE_OPTIONS.some(o => o.value === role) ? (role as RoleFilter) : 'ALL';
};

/**
 * Lấy ký tự đại diện avatar từ họ tên người dùng
 */
export const avatarChar = (name: string): string => {
    return (name || 'N').trim().charAt(0).toUpperCase();
};

/**
 * Lấy cấu hình style hiển thị theo role
 */
export const roleStyle = (role: string): { bg: string; color: string; label: string } => {
    return NOTIFICATION_ROLE_STYLE[role] ?? { bg: '#f1f5f9', color: '#475569', label: role };
};

