export interface TierBadgeStyle {
    border: string;
    background: string;
    glow: string;
    tagBg: string;
    textColor: string;
    tagColor: string;
}

export const TIER_BADGE_STYLES: Record<string, TierBadgeStyle> = {
    diamond: {
        border: '1.5px solid #38bdf8',
        background: 'linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 50%, #eff6ff 100%)',
        glow: '0 10px 25px rgba(56, 189, 248, 0.25)',
        tagBg: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
        textColor: '#1d4ed8',
        tagColor: 'blue',
    },
    gold: {
        border: '1.5px solid #facc15',
        background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
        glow: '0 10px 25px rgba(245, 158, 11, 0.25)',
        tagBg: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
        textColor: '#a16207',
        tagColor: 'gold',
    },
    silver: {
        border: '1.5px solid #cbd5e1',
        background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
        glow: '0 10px 20px rgba(148, 163, 184, 0.2)',
        tagBg: 'linear-gradient(135deg, #64748b 0%, #475569 100%)',
        textColor: '#475569',
        tagColor: 'default',
    },
    bronze: {
        border: '1.5px solid #fed7aa',
        background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
        glow: '0 8px 18px rgba(249, 115, 22, 0.15)',
        tagBg: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
        textColor: '#c2410c',
        tagColor: 'orange',
    },
    locked: {
        border: '1px solid #e2e8f0',
        background: '#f8fafc',
        glow: 'none',
        tagBg: '#94a3b8',
        textColor: '#64748b',
        tagColor: 'default',
    },
};

export interface RankVisualMeta {
    rank: number;
    isTop3: boolean;
    crown: string | null;
    background: string;
    borderColor: string;
    glowColor: string;
    color: string;
    podiumHeight: number;
    tagColor: string;
}

export const RANK_VISUAL_CONFIGS: Record<number, RankVisualMeta> = {
    1: {
        rank: 1,
        isTop3: true,
        crown: '👑',
        background: 'linear-gradient(180deg, #fef3c7 0%, #fde68a 100%)',
        borderColor: '#f59e0b',
        glowColor: 'rgba(245, 158, 11, 0.3)',
        color: '#92400e',
        podiumHeight: 205,
        tagColor: 'gold',
    },
    2: {
        rank: 2,
        isTop3: true,
        crown: null,
        background: 'linear-gradient(180deg, #f1f5f9 0%, #e2e8f0 100%)',
        borderColor: '#94a3b8',
        glowColor: 'rgba(148, 163, 184, 0.2)',
        color: '#1e293b',
        podiumHeight: 160,
        tagColor: 'blue',
    },
    3: {
        rank: 3,
        isTop3: true,
        crown: null,
        background: 'linear-gradient(180deg, #ffedd5 0%, #fed7aa 100%)',
        borderColor: '#f97316',
        glowColor: 'rgba(249, 115, 22, 0.2)',
        color: '#78350f',
        podiumHeight: 135,
        tagColor: 'orange',
    },
};

export const DEFAULT_RANK_VISUAL: RankVisualMeta = {
    rank: 0,
    isTop3: false,
    crown: null,
    background: '#f8fafc',
    borderColor: '#e2e8f0',
    glowColor: 'none',
    color: '#64748b',
    podiumHeight: 0,
    tagColor: 'default',
};

export const QUEST_CATEGORY_META: Record<string, { label: string; color: string; icon: string }> = {
    reading: { label: 'Reading', color: 'blue', icon: '📖' },
    streak: { label: 'Streak', color: 'volcano', icon: '🔥' },
    dictation: { label: 'Dictation', color: 'purple', icon: '🎧' },
    flashcard: { label: 'Flashcard', color: 'gold', icon: '⚡' },
    exam: { label: 'Exam', color: 'green', icon: '🏆' },
};

export const LEADERBOARD_PERIOD_OPTIONS = [
    { value: 'week', label: 'Tuần này' },
    { value: 'month', label: 'Tháng này' },
    { value: 'all', label: 'Toàn thời gian' },
] as const;
