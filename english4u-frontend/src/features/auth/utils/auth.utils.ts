import { FORCED_LOGOUT_REASON_KEY } from '../constants/auth.constants';

/**
 * Lưu lý do buộc đăng xuất vào sessionStorage (xử lý đa tab)
 */
export const setForcedLogoutReason = (reason: string): void => {
    if (typeof window !== 'undefined') {
        sessionStorage.setItem(FORCED_LOGOUT_REASON_KEY, reason);
    }
};

/**
 * Đọc và xóa lý do buộc đăng xuất khỏi sessionStorage
 */
export const consumeForcedLogoutReason = (): string | null => {
    if (typeof window === 'undefined') return null;

    const reason = sessionStorage.getItem(FORCED_LOGOUT_REASON_KEY);
    if (!reason) {
        return null;
    }

    sessionStorage.removeItem(FORCED_LOGOUT_REASON_KEY);
    return reason;
};

/**
 * Kiểm tra định dạng email hợp lệ
 */
export const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
};

/**
 * Kiểm tra độ mạnh của mật khẩu (tối thiểu 6 ký tự)
 */
export const isStrongPassword = (password: string): boolean => {
    return password.length >= 6;
};

