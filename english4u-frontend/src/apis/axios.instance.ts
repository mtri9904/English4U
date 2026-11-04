import axios from 'axios';
import { ENV } from '@/constants/env';
import { ROUTE_PATHS } from '@/constants/route-paths';

const BASE_URL = ENV.API_BASE_URL;

export const axiosInstance = axios.create({
    baseURL: BASE_URL,
    timeout: 0,
});

/**
 * Check whether the JWT token in localStorage has expired.
 * Returns true if token does not exist or has expired.
 */
export const isTokenExpired = (): boolean => {
    const token = localStorage.getItem('token');
    if (!token) return true;
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        // exp is Unix timestamp (seconds), Date.now() is milliseconds
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
    const loginPath = window.location.pathname.startsWith(ROUTE_PATHS.ADMIN_ROOT)
        ? ROUTE_PATHS.ADMIN_LOGIN
        : ROUTE_PATHS.LOGIN;
    const publicPaths = [
        ROUTE_PATHS.LOGIN,
        ROUTE_PATHS.ADMIN_LOGIN,
        ROUTE_PATHS.REGISTER,
        ROUTE_PATHS.FORGOT_PASSWORD,
        ROUTE_PATHS.RESET_PASSWORD,
    ];
    const isPublicPage = publicPaths.some(p => window.location.pathname.startsWith(p));
    if (!isPublicPage) {
        window.location.replace(loginPath);
    }
};

// Flag to prevent concurrent refresh requests (refresh only once)
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

        // Skip if status is not 401 or if this is the refresh request itself
        if (error.response?.status !== 401 || originalRequest._isRetry) {
            return Promise.reject(error);
        }

        const storedRefreshToken = localStorage.getItem('refreshToken');

        // No refresh token available -> logout directly
        if (!storedRefreshToken) {
            clearSession();
            redirectToLogin();
            return Promise.reject(error);
        }

        // If already refreshing, enqueue request to resolve queue
        if (isRefreshing) {
            return new Promise((resolve) => {
                pendingRequests.push((newToken: string) => {
                    originalRequest.headers.Authorization = `Bearer ${newToken}`;
                    resolve(axiosInstance(originalRequest));
                });
            });
        }

        // Start token refresh flow
        isRefreshing = true;
        originalRequest._isRetry = true;

        try {
            const response = await axios.post<{
                token: string;
                refreshToken: string;
                userId: string;
            }>(`${BASE_URL}/auth/refresh`, { refreshToken: storedRefreshToken });

            const { token: newToken, refreshToken: newRefreshToken } = response.data;

            // Update newly acquired tokens
            localStorage.setItem('token', newToken);
            localStorage.setItem('refreshToken', newRefreshToken);

            // Update default authorization header
            axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;

            // Resolve all queued requests
            processPendingRequests(newToken);

            // Retry initial request with new token
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return axiosInstance(originalRequest);
        } catch (refreshError) {
            // Refresh failed (expired or invalid refresh token) -> logout
            pendingRequests = [];
            clearSession();
            redirectToLogin();
            return Promise.reject(refreshError);
        } finally {
            isRefreshing = false;
        }
    }
);
