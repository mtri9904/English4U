/**
 * ROUTE_PATHS - Centralized Route Paths definition
 * Follows the enterprise pattern from Mebifarm CMS (web)
 */
export const ROUTE_PATHS = {
    // Public Marketing & Legal Pages
    HOME: '/',
    ABOUT: '/about',
    CONTACT: '/contact',
    PRIVACY_POLICY: '/privacy-policy',
    PRIVACY: '/privacy',
    TERMS_OF_SERVICE: '/terms-of-service',
    TERMS: '/terms',

    // Authentication
    LOGIN: '/login',
    REGISTER: '/register',
    FORGOT_PASSWORD: '/forgot-password',
    RESET_PASSWORD: '/reset-password',
    CONFIRM_EMAIL: '/confirm-email',
    ADMIN_LOGIN: '/admin/login',

    // Admin Portal
    ADMIN_ROOT: '/admin',
    ADMIN_DASHBOARD: '/admin/dashboard',
    ADMIN_USERS: '/admin/users',
    ADMIN_EXAMS: '/admin/exams',
    ADMIN_EXAM_DETAIL: '/admin/exams/:id',
    ADMIN_EXAM_CREATE: '/admin/exams/create',
    ADMIN_EXAM_GENERATE_AI: '/admin/exams/generate-ai',
    ADMIN_EXAM_EDIT: '/admin/exams/edit/:id',
    ADMIN_ATTEMPTS: '/admin/attempts',
    ADMIN_GAMIFICATION: '/admin/gamification',
    ADMIN_PROFILE: '/admin/profile',
    ADMIN_NOTIFICATIONS: '/admin/notifications',

    // Client Learning Application Portal
    APP_ROOT: '/app',
    APP_DASHBOARD: '/app',
    APP_PRACTICE: '/app/practice',
    APP_PRACTICE_EXAM: '/app/practice/:examId',
    APP_MY_EXAMS: '/app/my-exams',
    APP_SESSION_READING: '/app/sessions/:sessionId/reading',
    APP_SESSION_LISTENING: '/app/sessions/:sessionId/listening',
    APP_SESSION_WRITING: '/app/sessions/:sessionId/writing',
    APP_SESSION_SPEAKING: '/app/sessions/:sessionId/speaking',
    APP_SESSION_SUBMIT: '/app/sessions/:sessionId/submit',
    APP_PROGRESS: '/app/progress',
    APP_DICTATION: '/app/dictation',
    APP_FLASHCARDS: '/app/flashcards',
    APP_FLASHCARD_DECK: '/app/flashcards/:deckId',
    APP_FLASHCARD_STUDY: '/app/flashcards/:deckId/study',
    APP_PROFILE: '/app/profile',

    // Standalone Flashcard direct routes (compatibility)
    FLASHCARDS_ROOT: '/flashcards',
    FLASHCARDS_DECK: '/flashcards/:deckId',
    FLASHCARDS_STUDY: '/flashcards/:deckId/study',
} as const;

/**
 * Helper to build dynamic route paths with params
 * Example: buildRoute(ROUTE_PATHS.APP_PRACTICE_EXAM, { examId: '123' }) -> '/app/practice/123'
 */
export const buildRoute = (template: string, params: Record<string, string | number>): string => {
    let result = template;
    for (const [key, value] of Object.entries(params)) {
        result = result.replace(`:${key}`, String(value));
    }
    return result;
};
