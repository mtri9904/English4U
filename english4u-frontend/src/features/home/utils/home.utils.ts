/**
 * Lấy màu trạng thái tiến độ học
 */
export const getSkillProgressColor = (progress: number): string => {
    if (progress >= 80) return '#10b981';
    if (progress >= 60) return '#0ea5e9';
    return '#f59e0b';
};

/**
 * Tính phần trăm tiết kiệm khi thanh toán theo năm
 */
export const calculateAnnualSavings = (monthlyPrice: number, yearlyMonthlyPrice: number): number => {
    if (monthlyPrice <= 0) return 0;
    const savings = ((monthlyPrice - yearlyMonthlyPrice) / monthlyPrice) * 100;
    return Math.round(savings);
};

/**
 * Đếm số từ trong văn bản
 */
export const countWords = (text: string): number => {
    if (!text) return 0;
    const words = text.trim().split(/\s+/).filter((w) => w.length > 0);
    return words.length;
};

