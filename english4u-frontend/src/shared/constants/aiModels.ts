export interface AiModelConfig {
    id: string;
    name: string;
    description: string;
    rpd: string; // Requests per day
    rpm: string; // Requests per minute
    tag?: string;
    tagColor?: string;
    isHighQuota?: boolean;
}

/**
 * CẤU HÌNH DANH SÁCH AI MODEL TOÀN HỆ THỐNG (SINGLE SOURCE OF TRUTH)
 * Toàn bộ các trang/modal/tính năng AI trong dự án đều dùng chung danh sách này.
 * Khi cần thêm/bớt/đổi model, chỉ cần chỉnh sửa mảng AI_MODELS duy nhất tại file này.
 */
export const AI_MODELS: AiModelConfig[] = [
    {
        id: 'auto',
        name: '⚡ Tự động dự phòng đa tầng (Auto Fallback)',
        description: 'Tự động luân chuyển model tiếp theo khi model trước chạm limit/quota',
        rpd: 'Không giới hạn',
        rpm: 'Tự động',
        tag: 'Khuyên dùng',
        tagColor: 'green',
        isHighQuota: true,
    },
    {
        id: 'gemma-4-26b-a4b-it',
        name: 'Gemma 4 26B (A4B IT)',
        description: 'Mô hình mã nguồn mở thế hệ 4 từ Google, hạn mức cực đại 16.000 RPD, 30 RPM',
        rpd: '16K RPD',
        rpm: '30 RPM',
        tag: '16K RPD (Khủng nhất)',
        tagColor: 'volcano',
        isHighQuota: true,
    },
    {
        id: 'gemma-4-31b-it',
        name: 'Gemma 4 31B IT',
        description: 'Mô hình 31B tham số tối tân, hạn mức cực đại 16.000 RPD, 30 RPM',
        rpd: '16K RPD',
        rpm: '30 RPM',
        tag: '16K RPD (Khủng nhất)',
        tagColor: 'volcano',
        isHighQuota: true,
    },
    {
        id: 'gemini-3.1-flash-lite',
        name: 'Gemini 3.1 Flash Lite',
        description: 'Thế hệ 3.1 siêu nhanh, hạn mức cực lớn cho tài khoản',
        rpd: '500 RPD',
        rpm: '15 RPM',
        tag: '500 RPD (Cực lớn)',
        tagColor: 'cyan',
        isHighQuota: true,
    },
    {
        id: 'gemini-3.5-flash-lite',
        name: 'Gemini 3.5 Flash Lite',
        description: 'Thế hệ 3.5 Flash Lite tối ưu cao, hạn mức dồi dào',
        rpd: '500 RPD',
        rpm: '15 RPM',
        tag: '500 RPD',
        tagColor: 'cyan',
        isHighQuota: true,
    },
    {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        description: 'Mô hình chuẩn xác, chuyên sâu cho từ vựng và câu IELTS',
        rpd: '20 RPD',
        rpm: '5 RPM',
        tag: 'Chuẩn xác',
        tagColor: 'blue',
    },
    {
        id: 'gemini-2.5-flash-lite',
        name: 'Gemini 2.5 Flash-Lite',
        description: 'Bản rút gọn siêu tốc độ, tiết kiệm token',
        rpd: '20 RPD',
        rpm: '10 RPM',
        tag: '10 RPM',
        tagColor: 'geekblue',
    },
    {
        id: 'gemini-3.8-flash',
        name: 'Gemini 3.8 Flash',
        description: 'Thế hệ 3.8 Flash tốc độ cao',
        rpd: '20 RPD',
        rpm: '5 RPM',
        tag: 'Gen 3.8',
        tagColor: 'purple',
    },
    {
        id: 'gemini-3.7-flash',
        name: 'Gemini 3.7 Flash',
        description: 'Thế hệ 3.7 Flash',
        rpd: '20 RPD',
        rpm: '5 RPM',
        tag: 'Gen 3.7',
        tagColor: 'purple',
    },
    {
        id: 'gemini-3.6-flash',
        name: 'Gemini 3.6 Flash',
        description: 'Thế hệ 3.6 Flash',
        rpd: '20 RPD',
        rpm: '5 RPM',
        tag: 'Gen 3.6',
        tagColor: 'purple',
    },
    {
        id: 'gemini-3.5-flash',
        name: 'Gemini 3.5 Flash',
        description: 'Thế hệ 3.5 Flash đầy đủ tính năng',
        rpd: '20 RPD',
        rpm: '5 RPM',
        tag: 'Gen 3.5',
        tagColor: 'purple',
    },
    {
        id: 'gemini-3-flash-preview',
        name: 'Gemini 3 Flash Preview',
        description: 'Bản xem trước Gemini 3 Flash',
        rpd: '20 RPD',
        rpm: '5 RPM',
        tag: 'Gen 3',
        tagColor: 'gold',
    },
    {
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        description: 'Mô hình Pro chuyên sâu, xử lý ngữ cảnh IELTS phức tạp',
        rpd: '20 RPD',
        rpm: '2 RPM',
        tag: 'Pro',
        tagColor: 'volcano',
    },
    {
        id: 'gemini-3.1-pro-preview',
        name: 'Gemini 3.1 Pro Preview',
        description: 'Mô hình 3.1 Pro cao cấp nhất của Google',
        rpd: '20 RPD',
        rpm: '2 RPM',
        tag: 'Pro 3.1',
        tagColor: 'magenta',
    },
    {
        id: 'gemini-flash-latest',
        name: 'Gemini Flash Latest',
        description: 'Tự động trỏ đến bản Flash ổn định mới nhất',
        rpd: '20 RPD',
        rpm: '5 RPM',
        tag: 'Latest',
        tagColor: 'blue',
    },
];

export const DEFAULT_AI_MODEL = 'auto';
