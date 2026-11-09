import {
    TIER_BADGE_STYLES,
    RANK_VISUAL_CONFIGS,
    DEFAULT_RANK_VISUAL,
    QUEST_CATEGORY_META,
    type TierBadgeStyle,
    type RankVisualMeta,
} from '../constants/leaderboard.constants';

/**
 * Returns visual styling for badges based on their tier (diamond, gold, silver, bronze)
 */
export const getTierBadgeStyle = (tier: string, unlocked: boolean = true): TierBadgeStyle => {
    if (!unlocked) {
        return TIER_BADGE_STYLES.locked;
    }
    const key = tier?.toLowerCase() || 'bronze';
    return TIER_BADGE_STYLES[key] || TIER_BADGE_STYLES.bronze;
};

/**
 * Returns visual styles, colors and heights for podium and rank items
 */
export const getRankVisualMeta = (rank: number): RankVisualMeta => {
    if (RANK_VISUAL_CONFIGS[rank]) {
        return RANK_VISUAL_CONFIGS[rank];
    }
    return { ...DEFAULT_RANK_VISUAL, rank };
};

/**
 * Formats study duration in hours to 1 decimal place string with unit (e.g. "2.5 hours")
 */
export const formatStudyTime = (hours: number): string => {
    if (isNaN(hours) || hours <= 0) return '0.0 giờ';
    return `${hours.toFixed(1)} giờ`;
};

/**
 * Formats continuous learning daily streak count (e.g. "5 days")
 */
export const formatStreak = (streak: number): string => {
    const days = Math.max(0, Math.floor(streak || 0));
    return `${days} ngày`;
};

/**
 * Formats IELTS Band score display
 */
export const formatBandScore = (score: number | null | undefined): string => {
    if (score === null || score === undefined || score <= 0) return 'Chưa có Band';
    return `${score.toFixed(1)} Band`;
};

/**
 * Formats experience points (XP)
 */
export const formatXp = (xp: number): string => {
    const safeXp = Math.max(0, Math.floor(xp || 0));
    return `${safeXp.toLocaleString()} XP`;
};

/**
 * Returns metadata and color tags for quest categories
 */
export const getQuestCategoryMeta = (category: string) => {
    const key = category?.toLowerCase() || 'exam';
    return QUEST_CATEGORY_META[key] || QUEST_CATEGORY_META.exam;
};

