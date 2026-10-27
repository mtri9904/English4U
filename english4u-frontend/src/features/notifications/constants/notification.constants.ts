export type RoleFilter = 'ALL' | 'Student' | 'Admin';
export type ReadFilter = 'ALL' | 'read' | 'unread';
export type EditorMode = 'create' | 'edit';

export const PAGE_SIZE = 10;
export const LIVE_MS = 15_000;

export interface NotificationFormValues {
    title: string;
    message?: string;
    targetType: 'role' | 'users';
    targetRole?: RoleFilter;
    targetUserIds?: string[];
}

export const NOTIFICATION_ROLE_OPTIONS: Array<{ label: string; value: RoleFilter }> = [
    { label: 'Tất cả vai trò', value: 'ALL' },
    { label: 'Học viên',       value: 'Student' },
    { label: 'Quản trị viên',  value: 'Admin' },
];

export const NOTIFICATION_ROLE_STYLE: Record<string, { bg: string; color: string; label: string }> = {
    Student: { bg: '#dbeafe', color: '#1d4ed8', label: 'Học viên' },
    Admin:   { bg: '#fee2e2', color: '#b91c1c', label: 'Quản trị' },
};

export const DEFAULT_NOTIFICATION_FORM: NotificationFormValues = {
    title: '',
    message: '',
    targetType: 'role',
    targetRole: 'Student',
    targetUserIds: [],
};

// Aliases for backwards compatibility
export const ROLE_OPTIONS = NOTIFICATION_ROLE_OPTIONS;
export const ROLE_STYLE = NOTIFICATION_ROLE_STYLE;
export const DEFAULT_FORM = DEFAULT_NOTIFICATION_FORM;
