/**
 * ENV - Centralized Environment Configuration
 * Follows the enterprise pattern from Mebifarm CMS (web)
 */

const getEnv = (key: string, fallback: string = ''): string => {
    return (import.meta.env[key] as string) || fallback;
};

export const ENV = {
    API_BASE_URL: getEnv('VITE_API_BASE_URL', 'http://localhost:5000/api'),
    AI_API_BASE_URL: getEnv('VITE_AI_API_BASE_URL', 'http://localhost:8000/api'),
    CLOUDINARY_CLOUD_NAME: getEnv('VITE_CLOUDINARY_CLOUD_NAME', ''),
    CLOUDINARY_UPLOAD_PRESET: getEnv('VITE_CLOUDINARY_UPLOAD_PRESET', ''),
    GOOGLE_CLIENT_ID: getEnv('VITE_GOOGLE_CLIENT_ID', ''),
    IS_DEV: import.meta.env.DEV,
    IS_PROD: import.meta.env.PROD,
} as const;
