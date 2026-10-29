/**
 * ApiRouters - Centralized API Endpoints definition
 * Follows the enterprise pattern from Mebifarm CMS (web)
 */
export const ApiRouters = {
    AUTH: {
        LOGIN: 'auth/login',
        REGISTER: 'auth/register',
        REFRESH_TOKEN: 'auth/refresh',
        REVOKE_TOKEN: 'auth/revoke',
        GOOGLE: 'auth/google',
        CONFIRM_EMAIL: 'auth/confirm-email',
        VERIFY_OTP: 'auth/verify-otp',
        FORGOT_PASSWORD: 'auth/forgot-password',
        RESET_PASSWORD: 'auth/reset-password',
    },

    EXAM: {
        BASE: '/exam',
        BY_ID: (id: string | number) => `/exam/${id}`,
        PUBLISH: (id: string | number) => `/exam/${id}/publish`,
        SPEAKING_PROMPT_AUDIO: '/exam/speaking-prompt-audio',
        GENERATE_FROM_PDF: '/exam/generate-from-pdf',
        GENERATE_AI: '/exam/generate-ai',
        GENERATE_PDF_PROGRESS: '/exam/generate-from-pdf/progress',
        GENERATE_LISTENING_TRANSCRIPT: '/exam/generate-listening-transcript',
        ALIGN_LISTENING_TRANSCRIPT: '/exam/align-listening-transcript',
        EXTRACT_WRITING_VISUAL_DATA: '/exam/extract-writing-visual-data',
    },

    ATTEMPT: {
        BASE: '/attempt',
        ADMIN: '/attempt/admin',
        BY_ID: (id: string | number) => `/attempt/${id}`,
    },

    PRACTICE: {
        BASE: '/practice',
        EXAMS: '/practice/exams',
        MY_EXAMS: '/practice/my-exams',
        USER_EXAMS: '/practice/user-exams',
        EXAM_BY_ID: (examId: string | number) => `/practice/exams/${examId}`,
        START_EXAM: (examId: string | number) => `/practice/exams/${examId}/start`,
        DASHBOARD: '/practice/dashboard',
        PROGRESS: '/practice/progress',
        DICTATION_GENERATE: '/practice/dictation/generate',
        DICTATION_AUDIO: '/practice/dictation/audio',
    },

    SESSION: {
        BASE: '/practice/sessions',
        BY_ID: (sessionId: string | number) => `/practice/sessions/${sessionId}`,
        ANSWERS: (sessionId: string | number) => `/practice/sessions/${sessionId}/answers`,
        HIGHLIGHTS: (sessionId: string | number) => `/practice/sessions/${sessionId}/highlights`,
        SPEAKING_RECORDINGS: (sessionId: string | number) => `/practice/sessions/${sessionId}/speaking-recordings`,
        SUBMIT_READING_LISTENING: (sessionId: string | number) => `/practice/sessions/${sessionId}/submit-reading-listening`,
        SUBMIT_WRITING: (sessionId: string | number) => `/practice/sessions/${sessionId}/submit-writing`,
        SUBMIT_SPEAKING: (sessionId: string | number) => `/practice/sessions/${sessionId}/submit-speaking`,
        RESCORE_SPEAKING: (sessionId: string | number) => `/practice/sessions/${sessionId}/rescore-speaking`,
    },

    FLASHCARD: {
        DECKS: '/flashcard/decks',
        DECK_BY_ID: (id: string | number) => `/flashcard/decks/${id}`,
        DECK_CARDS: (deckId: string | number) => `/flashcard/decks/${deckId}/cards`,
        DECK_STUDY: (deckId: string | number) => `/flashcard/decks/${deckId}/study`,
        ITEMS: '/flashcard/items',
        ITEM_BY_ID: (id: string | number) => `/flashcard/items/${id}`,
        ITEM_REVIEW: (id: string | number) => `/flashcard/items/${id}/review`,
        AI_ENRICH: '/flashcard/ai/enrich',
        AI_CHECK_SENTENCE: '/flashcard/ai/check-sentence',
    },

    NOTIFICATION: {
        BASE: '/notification',
        UNREAD_COUNT: '/notification/unread-count',
        READ_ALL: '/notification/read-all',
        MARK_READ: (id: string | number) => `/notification/${id}/read`,
        ADMIN_BASE: 'admin/notifications',
        ADMIN_STATS: 'admin/notifications/stats',
        ADMIN_BROADCAST: 'admin/notifications/broadcast',
        ADMIN_BY_ID: (id: string | number) => `admin/notifications/${id}`,
        ADMIN_READ: (id: string | number) => `admin/notifications/${id}/read`,
        ADMIN_MARK_ALL_READ: 'admin/notifications/mark-all-read',
        CLIENT_MY: 'notifications/my',
        CLIENT_STATS: 'notifications/my/stats',
        CLIENT_READ: (id: string | number) => `notifications/${id}/read`,
        CLIENT_MARK_ALL_READ: 'notifications/my/mark-all-read',
    },

    USER: {
        BASE: '/user',
        PROFILE: '/user/profile',
        STUDENTS: '/user/students',
    },

    ADMIN: {
        DASHBOARD: '/admin/dashboard',
    },

    COPILOT: {
        CHAT: '/copilot/chat',
        HINT: '/copilot/hint',
    },
} as const;
