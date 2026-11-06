export type LeaderboardCategory = 'diligence' | 'streak' | 'score';
export type LeaderboardPeriod = 'week' | 'month' | 'all';

export interface LeaderboardItem {
    rank: number;
    userId: string;
    displayName: string;
    email: string;
    avatarUrl?: string | null;
    primaryMetricValue: number;
    primaryMetricLabel: string;
    secondaryMetricLabel: string;
    experiencePoints: number;
    dailyStreakCount: number;
    longestStreakCount: number;
    totalStudyHours: number;
    examsCompletedCount: number;
    averageBandScore?: number | null;
    topBadge?: string | null;
    isCurrentUser: boolean;
}

export interface BadgeItem {
    id: string;
    title: string;
    description: string;
    category: 'ielts' | 'streak' | 'diligence' | 'special' | string;
    tier: 'bronze' | 'silver' | 'gold' | 'diamond';
    icon: string;
    unlocked: boolean;
    unlockedAt?: string | null;
    currentProgress: number;
    targetProgress: number;
    progressUnit: string;
    xpReward: number;
}

export interface WeeklyQuest {
    id: string;
    title: string;
    description: string;
    category: 'reading' | 'streak' | 'dictation' | 'flashcard' | 'exam' | string;
    icon: string;
    currentProgress: number;
    targetProgress: number;
    progressLabel: string;
    xpReward: number;
    isCompleted: boolean;
    isClaimed: boolean;
    actionUrl: string;
    remainingDays: number;
}

export interface UserGamificationHeader {
    currentRank: number;
    totalXp: number;
    level: number;
    nextLevelXp: number;
    dailyStreak: number;
    badgesUnlockedCount: number;
    totalBadgesCount: number;
    questsCompletedCount: number;
    totalQuestsCount: number;
}

export interface LeaderboardOverview {
    category: LeaderboardCategory;
    period: LeaderboardPeriod;
    rankings: LeaderboardItem[];
    currentUserRank?: LeaderboardItem | null;
    totalParticipants: number;
    badges: BadgeItem[];
    weeklyQuests: WeeklyQuest[];
    userSummary: UserGamificationHeader;
}

export interface ClaimQuestRewardResponse {
    success: boolean;
    questId: string;
    xpEarned: number;
    totalXp: number;
    message: string;
}

export interface AdminBadgeStat {
    id: string;
    title: string;
    category: string;
    tier: string;
    icon: string;
    unlockedCount: number;
    unlockedPercentage: number;
    xpReward: number;
}

export interface AdminQuestStat {
    id: string;
    title: string;
    category: string;
    icon: string;
    target: number;
    completedLearnersCount: number;
    completionRate: number;
    xpReward: number;
}

export interface AdminLeaderboardOverview {
    category: LeaderboardCategory;
    period: LeaderboardPeriod;
    totalLearners: number;
    activeLearners: number;
    totalStudyHours: number;
    totalExamsCompleted: number;
    averageBandScore: number;
    highestStreak: number;
    totalXpAwarded: number;
    rankings: LeaderboardItem[];
    badgeDistribution: AdminBadgeStat[];
    questOverview: AdminQuestStat[];
}
