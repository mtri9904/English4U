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
        STATS: '/exam/stats',
        BY_ID: (id: string | number) => `/exam/${id}`,
        PUBLISH: (id: string | number) => `/exam/${id}/publish`,
        SPEAKING_PROMPT_AUDIO: '/exam/speaking-prompt-audio',
        GENERATE_FROM_PDF: '/exam/generate-from-pdf',
        GENERATE_AI: '/exam/generate-ai',
        GENERATE_PDF_PROGRESS: '/exam/generate-from-pdf/progress',
        GENERATE_PDF_ACTIVE_JOB: '/exam/generate-from-pdf/active-job',
        GENERATE_PDF_CANCEL: '/exam/generate-from-pdf/cancel',
        GENERATE_LISTENING_TRANSCRIPT: '/exam/generate-listening-transcript',
        ALIGN_LISTENING_TRANSCRIPT: '/exam/align-listening-transcript',
        EXTRACT_WRITING_VISUAL_DATA: '/exam/extract-writing-visual-data',
    },

    ATTEMPT: {
        BASE: '/attempt',
        ADMIN: '/attempt/admin',
        ADMIN_STATS: '/admin/attempts/stats',
        BY_ID: (id: string | number) => `/attempt/${id}`,
    },

    PRACTICE: {
        BASE: '/practice',
        EXAMS: '/practice/exams',
        MY_EXAMS: '/practice/my-exams',
        MY_EXAMS_STATS: '/practice/my-exams/stats',
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
        GEMINI_MODELS: '/admin/ai/gemini-models',
        AI_FEATURES_CONFIG: '/admin/ai/features-config',
    },

    COPILOT: {
        CHAT: '/copilot/chat',
        HINT: '/copilot/hint',
    },

    FEEDBACK: {
        BASE: 'feedbacks',
        UPLOAD_IMAGE: 'feedbacks/upload-image',
        RECENT: 'feedbacks/recent',
        MY: 'feedbacks/my',
        BY_ID: (id: string | number) => `feedbacks/${id}`,
        ADMIN_BASE: 'admin/feedbacks',
        ADMIN_STATS: 'admin/feedbacks/stats',
        ADMIN_UPDATE_STATUS: (id: string | number) => `admin/feedbacks/${id}/status`,
        ADMIN_DELETE: (id: string | number) => `admin/feedbacks/${id}`,
    },

    NEWS: {
        BASE: '/news',
        ARTICLE: '/news/article',
        QUOTA: '/news/quota',
        TRANSLATE: '/news/translate',
        DICTIONARY: '/news/dictionary',
    },

    LEADERBOARD: {
        BASE: '/leaderboard',
        ADMIN_SUMMARY: '/leaderboard/admin-summary',
        BADGES: '/leaderboard/badges',
        QUESTS: '/leaderboard/quests',
        CLAIM_QUEST: (questId: string) => `/leaderboard/quests/${questId}/claim`,
    },
};
