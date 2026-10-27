export const STUDENT_PLAN_CONFIG: Record<string, { bg: string; color: string }> = {
    Free: { bg: '#f1f5f9', color: '#475569' },
    Pro: { bg: '#dbeafe', color: '#1d4ed8' },
    Premium: { bg: '#fef3c7', color: '#92400e' },
};

export const STUDENT_ROLE_VISUAL_MAP: Record<string, { label: string; bg: string; color: string; border: string }> = {
    Student: { label: 'Học viên', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
    Admin: { label: 'Quản trị', bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
    Teacher: { label: 'Giáo viên', bg: '#ecfeff', color: '#0e7490', border: '#a5f3fc' },
    ContentCreator: { label: 'Sáng tạo nội dung', bg: '#f5f3ff', color: '#6d28d9', border: '#ddd6fe' },
};

export const STUDENT_ROLES = ['Student', 'Admin', 'Teacher', 'ContentCreator'] as const;

export const PROFILE_GOAL_OPTIONS = [
    {
        label: 'Vai trò học tập',
        options: [
            { label: 'Học sinh THPT', value: 'Học sinh THPT' },
            { label: 'Sinh viên', value: 'Sinh viên' },
            { label: 'Người đi làm', value: 'Người đi làm' },
            { label: 'Tự học IELTS', value: 'Tự học IELTS' },
        ],
    },
    {
        label: 'Mục tiêu band',
        options: [
            { label: 'Mục tiêu band 5.5', value: 'Mục tiêu band 5.5' },
            { label: 'Mục tiêu band 6.0', value: 'Mục tiêu band 6.0' },
            { label: 'Mục tiêu band 6.5', value: 'Mục tiêu band 6.5' },
            { label: 'Mục tiêu band 7.0', value: 'Mục tiêu band 7.0' },
            { label: 'Mục tiêu band 7.5+', value: 'Mục tiêu band 7.5+' },
        ],
    },
];

// Aliases for backwards compatibility
export const planConfig = STUDENT_PLAN_CONFIG;
export const roleVisualMap = STUDENT_ROLE_VISUAL_MAP;
