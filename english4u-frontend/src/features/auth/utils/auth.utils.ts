import { FORCED_LOGOUT_REASON_KEY } from '../constants/auth.constants';

/**
 * Store forced logout reason in sessionStorage (cross-tab handling)
 */
export const setForcedLogoutReason = (reason: string): void => {
    if (typeof window !== 'undefined') {
        sessionStorage.setItem(FORCED_LOGOUT_REASON_KEY, reason);
    }
};

/**
 * Retrieve and remove forced logout reason from sessionStorage
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
 * Validate email address format
 */
export const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
};

/**
 * Validate password strength (minimum 6 characters)
 */
export const isStrongPassword = (password: string): boolean => {
    return password.length >= 6;
};

