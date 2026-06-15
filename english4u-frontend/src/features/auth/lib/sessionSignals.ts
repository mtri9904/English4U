export const FORCED_LOGOUT_REASON_KEY = 'auth:forced-logout-reason';
export const SESSION_CONFLICT_MESSAGE = 'Phiên đăng nhập đã thay đổi ở tab khác. Vui lòng đăng nhập lại.';

export const setForcedLogoutReason = (reason: string) => {
    sessionStorage.setItem(FORCED_LOGOUT_REASON_KEY, reason);
};

export const consumeForcedLogoutReason = () => {
    const reason = sessionStorage.getItem(FORCED_LOGOUT_REASON_KEY);
    if (!reason) {
        return null;
    }

    sessionStorage.removeItem(FORCED_LOGOUT_REASON_KEY);
    return reason;
};
