import { create } from 'zustand';
import { authService } from '../services/api.service';

const useAuthStore = create((set, get) => ({
    user: authService.getCurrentUser(),
    isAuthenticated: authService.isAuthenticated(),
    isLoading: false,
    error: null,

    // Check if user is admin
    isAdmin: () => {
        const { user } = get();
        return user?.Role === 'Admin';
    },

    // Login action
    login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
            const data = await authService.login(email, password);
            set({
                user: data.user,
                isAuthenticated: true,
                isLoading: false,
            });
            return data;
        } catch (error) {
            set({
                error: error.response?.data?.message || 'Login failed',
                isLoading: false,
            });
            throw error;
        }
    },

    // Register action
    register: async (fullName, email, password) => {
        set({ isLoading: true, error: null });
        try {
            const data = await authService.register({ fullName, email, password });
            set({
                user: data.user,
                isAuthenticated: true,
                isLoading: false,
            });
            return data;
        } catch (error) {
            set({
                error: error.response?.data?.message || 'Registration failed',
                isLoading: false,
            });
            throw error;
        }
    },

    // Logout action
    logout: () => {
        authService.logout();
        set({ user: null, isAuthenticated: false });
    },

    // Clear error
    clearError: () => set({ error: null }),
}));

export default useAuthStore;
