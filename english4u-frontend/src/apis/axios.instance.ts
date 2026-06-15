import axios from 'axios';

const BASE_URL = (import.meta as any).env.VITE_API_BASE_URL || 'http://localhost:5237/api';

export const axiosInstance = axios.create({
    baseURL: BASE_URL,
    timeout: 10000,
});

/**
 * Kiểm tra JWT token trong localStorage có hết hạn chưa.
 * Trả về true nếu token không tồn tại hoặc đã hết hạn.
 */
export const isTokenExpired = (): boolean => {
    const token = localStorage.getItem('token');
    if (!token) return true;
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        // exp là Unix timestamp (giây), Date.now() là milliseconds
        return payload.exp * 1000 < Date.now();
    } catch {
        return true;
    }
};

const clearSession = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userId');
};

const redirectToLogin = () => {
    const loginPath = window.location.pathname.startsWith('/admin')
        ? '/admin/login'
        : '/login';
    const publicPaths = ['/login', '/admin/login', '/register', '/forgot-password', '/reset-password'];
    const isPublicPage = publicPaths.some(p => window.location.pathname.startsWith(p));
    if (!isPublicPage) {
        window.location.replace(loginPath);
    }
};

// Flag để tránh nhiều request refresh cùng lúc (chỉ refresh 1 lần)
let isRefreshing = false;
let pendingRequests: Array<(token: string) => void> = [];

const processPendingRequests = (token: string) => {
    pendingRequests.forEach(cb => cb(token));
    pendingRequests = [];
};

axiosInstance.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (config.headers && token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

axiosInstance.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        // Bỏ qua nếu không phải 401 hoặc đây là request refresh chính nó
        if (error.response?.status !== 401 || originalRequest._isRetry) {
            return Promise.reject(error);
        }

        const storedRefreshToken = localStorage.getItem('refreshToken');

        // Không có refresh token → logout thẳng
        if (!storedRefreshToken) {
            clearSession();
            redirectToLogin();
            return Promise.reject(error);
        }

        // Nếu đang refresh, đưa request vào hàng đợi
        if (isRefreshing) {
            return new Promise((resolve) => {
                pendingRequests.push((newToken: string) => {
                    originalRequest.headers.Authorization = `Bearer ${newToken}`;
                    resolve(axiosInstance(originalRequest));
                });
            });
        }

        // Bắt đầu quá trình refresh
        isRefreshing = true;
        originalRequest._isRetry = true;

        try {
            const response = await axios.post<{
                token: string;
                refreshToken: string;
                userId: string;
            }>(`${BASE_URL}/auth/refresh`, { refreshToken: storedRefreshToken });

            const { token: newToken, refreshToken: newRefreshToken } = response.data;

            // Cập nhật tokens mới
            localStorage.setItem('token', newToken);
            localStorage.setItem('refreshToken', newRefreshToken);

            // Cập nhật header mặc định
            axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;

            // Giải phóng tất cả requests đang chờ
            processPendingRequests(newToken);

            // Retry request ban đầu với token mới
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return axiosInstance(originalRequest);
        } catch (refreshError) {
            // Refresh thất bại (refresh token hết hạn hoặc không hợp lệ) → logout
            pendingRequests = [];
            clearSession();
            redirectToLogin();
            return Promise.reject(refreshError);
        } finally {
            isRefreshing = false;
        }
    }
);
