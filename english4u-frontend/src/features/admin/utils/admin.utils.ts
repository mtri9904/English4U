/**
 * Lấy cấu hình màu sắc badge trạng thái bài thi cho Admin Dashboard
 */
export const getAdminStatusColor = (status: string): { bg: string; text: string; dot: string } => {
    switch (status?.toLowerCase()) {
        case 'completed': return { bg: '#d1fae5', text: '#065f46', dot: '#10b981' };
        case 'in_progress': return { bg: '#dbeafe', text: '#1e40af', dot: '#3b82f6' };
        case 'abandoned': return { bg: '#fee2e2', text: '#991b1b', dot: '#ef4444' };
        default: return { bg: '#f1f5f9', text: '#475569', dot: '#94a3b8' };
    }
};

/**
 * Định dạng nhãn tiếng Việt cho trạng thái bài thi
 */
export const formatAdminStatus = (s: string): string => {
    switch (s?.toLowerCase()) {
        case 'completed': return 'Hoàn thành';
        case 'in_progress': return 'Đang thi';
        case 'abandoned': return 'Bỏ dở';
        default: return s;
    }
};

// Aliases for backwards compatibility
export const getStatusColor = getAdminStatusColor;
export const formatStatus = formatAdminStatus;

