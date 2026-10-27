import { STUDENT_ROLE_VISUAL_MAP } from '../constants/student.constants';

/**
 * Trả về mã màu tương ứng với thang điểm IELTS của học viên
 */
export const getScoreColor = (score: number): string => {
    if (score >= 8.0) return '#16a34a';
    if (score >= 6.5) return '#0ea5e9';
    return '#f59e0b';
};

/**
 * Lấy cấu hình visual hiển thị vai trò người dùng (label, màu nền, viền)
 */
export const getRoleVisual = (role: string) =>
    STUDENT_ROLE_VISUAL_MAP[role] || {
        label: role || 'Người dùng',
        bg: '#f8fafc',
        color: '#334155',
        border: '#cbd5e1',
    };

/**
 * Animation helper fadeUp
 */
export const fadeUp = (delay = 0) => ({
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.35, delay },
});

/**
 * Tổng hợp thông điệp khích lệ theo chuỗi ngày học (streak)
 */
export const getStreakSummary = (streak: number) => {
    if (streak >= 14) {
        return {
            title: `🔥 Chuỗi ${streak} ngày`,
            description: 'Phong độ rất tốt. Hãy tiếp tục duy trì việc học đều đặn mỗi ngày.',
            accent: '#f97316',
            background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
        };
    }

    if (streak >= 7) {
        return {
            title: `🔥 Chuỗi ${streak} ngày`,
            description: 'Bạn đã vào guồng học tập ổn định. Cố giữ thêm vài ngày để mở rộng streak.',
            accent: '#ea580c',
            background: 'linear-gradient(135deg, #fff7ed 0%, #fffbeb 100%)',
        };
    }

    if (streak >= 1) {
        return {
            title: `🔥 Chuỗi ${streak} ngày`,
            description: 'Hôm nay chỉ cần hoàn thành thêm ít nhất 1 bài là chuỗi sẽ tiếp tục tăng.',
            accent: '#2563eb',
            background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
        };
    }

    return {
        title: 'Chưa có chuỗi ngày học',
        description: 'Làm bài luyện tập hoặc đề thi hôm nay để bắt đầu tích lũy streak.',
        accent: '#64748b',
        background: '#f8fafc',
    };
};

export const formatPracticeMinutes = (minutes: number): string => {
    if (minutes <= 0) {
        return '0 phút';
    }

    if (minutes < 60) {
        return `${minutes} phút`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0
        ? `${hours} giờ ${remainingMinutes} phút`
        : `${hours} giờ`;
};

export const getSkillTone = (skillType: string): { color: string; background: string } => {
    const normalized = skillType.trim().toUpperCase();

    switch (normalized) {
        case 'READING':
            return { color: '#137dc5', background: '#eff6ff' };
        case 'LISTENING':
            return { color: '#7c3aed', background: '#f5f3ff' };
        case 'WRITING':
            return { color: '#d97706', background: '#fff7ed' };
        case 'SPEAKING':
            return { color: '#16a34a', background: '#f0fdf4' };
        default:
            return { color: '#475569', background: '#f8fafc' };
    }
};

// Aliases for backwards compatibility
export const scoreColor = getScoreColor;
