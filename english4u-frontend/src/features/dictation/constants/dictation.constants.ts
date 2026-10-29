import type { VoicePersona } from '../types/dictation.types';

export const AUDIO_SPEED_OPTIONS = [0.75, 0.9, 1.0, 1.25] as const;

export const ACCENT_NAME_MAP: Record<string, string> = {
    US: 'Mỹ',
    UK: 'Anh',
    AU: 'Úc',
    CA: 'Canada',
    IE: 'Ireland',
    IN: 'Ấn Độ',
};

export interface AccentBadgeStyle {
    bg: string;
    color: string;
    border: string;
    label: string;
}

export const ACCENT_BADGE_STYLES: Record<string, AccentBadgeStyle> = {
    US: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', label: 'US' },
    UK: { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca', label: 'UK' },
    AU: { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0', label: 'AU' },
    CA: { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa', label: 'CA' },
    IE: { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0', label: 'IE' },
    IN: { bg: '#fffbeb', color: '#b45309', border: '#fde68a', label: 'IN' },
};

export const TOPIC_PRESETS = [
    { key: 'daily', label: '☕ Đời sống hàng ngày' },
    { key: 'business', label: '💼 Công việc & Phỏng vấn' },
    { key: 'travel', label: '✈️ Du lịch & Khám phá' },
    { key: 'academic', label: '🎓 Học thuật & Khoa học' },
    { key: 'custom', label: '✏️ Chủ đề tự nhập...' },
] as const;

export const CURATED_VOICES: VoicePersona[] = [
    // Mỹ (US)
    {
        id: 'en-US-JennyNeural',
        name: 'Jenny',
        accent: 'US',
        flag: '🇺🇸',
        gender: 'female',
        description: 'Nữ Mỹ – Giọng chuẩn giáo viên, ấm áp, phát âm rõ ràng',
    },
    {
        id: 'en-US-GuyNeural',
        name: 'Guy',
        accent: 'US',
        flag: '🇺🇸',
        gender: 'male',
        description: 'Nam Mỹ – Trầm ấm, tự nhiên, nhịp điệu giao tiếp đời sống',
    },
    {
        id: 'en-US-AriaNeural',
        name: 'Aria',
        accent: 'US',
        flag: '🇺🇸',
        gender: 'female',
        description: 'Nữ Mỹ – Truyền cảm, tự tin, diễn đạt phong phú',
    },
    {
        id: 'en-US-ChristopherNeural',
        name: 'Christopher',
        accent: 'US',
        flag: '🇺🇸',
        gender: 'male',
        description: 'Nam Mỹ – Rõ ràng, đĩnh đạc, hiện đại',
    },
    {
        id: 'en-US-MichelleNeural',
        name: 'Michelle',
        accent: 'US',
        flag: '🇺🇸',
        gender: 'female',
        description: 'Nữ Mỹ – Dịu dàng, chuẩn mực, dễ nghe',
    },
    {
        id: 'en-US-EricNeural',
        name: 'Eric',
        accent: 'US',
        flag: '🇺🇸',
        gender: 'male',
        description: 'Nam Mỹ – Năng động, tự nhiên, gần gũi',
    },

    // Anh (UK)
    {
        id: 'en-GB-SoniaNeural',
        name: 'Sonia',
        accent: 'UK',
        flag: '🇬🇧',
        gender: 'female',
        description: 'Nữ Anh – Chuẩn Anh-Anh (RP), thanh lịch, ngữ điệu tinh tế',
    },
    {
        id: 'en-GB-RyanNeural',
        name: 'Ryan',
        accent: 'UK',
        flag: '🇬🇧',
        gender: 'male',
        description: 'Nam Anh – Giọng đĩnh đạc, sang trọng, ngữ điệu BBC',
    },
    {
        id: 'en-GB-LibbyNeural',
        name: 'Libby',
        accent: 'UK',
        flag: '🇬🇧',
        gender: 'female',
        description: 'Nữ Anh – Trẻ trung, tự nhiên, phát âm sắc sảo',
    },
    {
        id: 'en-GB-ThomasNeural',
        name: 'Thomas',
        accent: 'UK',
        flag: '🇬🇧',
        gender: 'male',
        description: 'Nam Anh – Thân thiện, ấm áp, ngữ điệu đời thường',
    },

    // Úc (AU)
    {
        id: 'en-AU-NatashaNeural',
        name: 'Natasha',
        accent: 'AU',
        flag: '🇦🇺',
        gender: 'female',
        description: 'Nữ Úc – Ngữ điệu tự nhiên, luyện bắt âm đời thực sắc nét',
    },
    {
        id: 'en-AU-WilliamNeural',
        name: 'William',
        accent: 'AU',
        flag: '🇦🇺',
        gender: 'male',
        description: 'Nam Úc – Trầm ấm, chuẩn ngữ âm Úc',
    },

    // Canada (CA)
    {
        id: 'en-CA-ClaraNeural',
        name: 'Clara',
        accent: 'CA',
        flag: '🇨🇦',
        gender: 'female',
        description: 'Nữ Canada – Trong trẻo, chuẩn Bắc Mỹ',
    },
    {
        id: 'en-CA-LiamNeural',
        name: 'Liam',
        accent: 'CA',
        flag: '🇨🇦',
        gender: 'male',
        description: 'Nam Canada – Trẻ trung, năng động',
    },

    // Ireland (IE) & Ấn Độ (IN)
    {
        id: 'en-IE-EmilyNeural',
        name: 'Emily',
        accent: 'IE',
        flag: '🇮🇪',
        gender: 'female',
        description: 'Nữ Ireland – Ngữ điệu mềm mại, luyện đa dạng âm',
    },
    {
        id: 'en-IN-NeerjaNeural',
        name: 'Neerja',
        accent: 'IN',
        flag: '🇮🇳',
        gender: 'female',
        description: 'Nữ Ấn Độ – Chuẩn Anh-Ấn, luyện nghe môi trường quốc tế',
    },
];

