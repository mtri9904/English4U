import api from '../lib/api';

// Authentication Service
export const authService = {
    // Register new user
    register: async (data) => {
        const response = await api.post('/auth/register', {
            FullName: data.fullName,
            Email: data.email,
            Password: data.password,
        });

        if (response.data.token) {
            localStorage.setItem('auth_token', response.data.token);
            localStorage.setItem('user', JSON.stringify(response.data.user));
        }

        return response.data;
    },

    // Login user
    login: async (email, password) => {
        const response = await api.post('/auth/login', {
            Email: email,
            Password: password,
        });

        if (response.data.token) {
            localStorage.setItem('auth_token', response.data.token);
            localStorage.setItem('user', JSON.stringify(response.data.user));
        }

        return response.data;
    },

    // Get user profile
    getProfile: async () => {
        const response = await api.get('/auth/profile');
        return response.data;
    },

    // Logout
    logout: () => {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');
    },

    // Get current user from localStorage
    getCurrentUser: () => {
        const userStr = localStorage.getItem('user');
        return userStr ? JSON.parse(userStr) : null;
    },

    // Check if user is authenticated
    isAuthenticated: () => {
        return !!localStorage.getItem('auth_token');
    },
};

// Courses Service
export const coursesService = {
    // Get all published courses
    getAllCourses: async () => {
        const response = await api.get('/courses');
        return response.data;
    },

    // Get course details with units and lessons
    getCourseById: async (id) => {
        const response = await api.get(`/courses/${id}`);
        return response.data;
    },

    // Create course (Admin)
    createCourse: async (data) => {
        const response = await api.post('/courses', data);
        return response.data;
    },

    // Update course (Admin)
    updateCourse: async (id, data) => {
        const response = await api.put(`/courses/${id}`, data);
        return response.data;
    },

    // Delete course (Admin)
    deleteCourse: async (id) => {
        const response = await api.delete(`/courses/${id}`);
        return response.data;
    },
};

// Lessons Service
export const lessonsService = {
    // Get lesson content and questions
    getLessonById: async (id) => {
        const response = await api.get(`/lessons/${id}`);
        return response.data;
    },

    // Submit answers for auto-grading
    submitAnswers: async (lessonId, answers) => {
        const response = await api.post('/lessons/submit', {
            LessonID: lessonId,
            answers: answers,
        });
        return response.data;
    },
};

// Speaking Service
export const speakingService = {
    // Upload speaking audio
    uploadAudio: async (questionId, audioFile) => {
        const formData = new FormData();
        formData.append('audio', audioFile);
        formData.append('QuestionID', questionId.toString());

        const response = await api.post('/speaking/upload', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });

        return response.data;
    },
};

// Admin Service
export const adminService = {
    // Get all users (Admin only)
    getAllUsers: async () => {
        const response = await api.get('/users');
        return response.data;
    },

    // Get user by ID (Admin only)
    getUserById: async (id) => {
        const response = await api.get(`/users/${id}`);
        return response.data;
    },

    // Update user role (Admin only)
    updateUserRole: async (userId, roleName) => {
        const response = await api.put(`/users/${userId}/role`, { roleName });
        return response.data;
    },

    // Update user status (Admin only)  
    updateUserStatus: async (userId, isActive) => {
        const response = await api.put(`/users/${userId}/status`, { isActive });
        return response.data;
    },
};

export default {
    auth: authService,
    courses: coursesService,
    lessons: lessonsService,
    speaking: speakingService,
    admin: adminService,
};
