import { axiosInstance } from '@/apis/axios.instance';
import { ApiRouters } from '@/constants/api-routes';
import type {
    LeaderboardCategory,
    LeaderboardPeriod,
    LeaderboardOverview,
    BadgeItem,
    WeeklyQuest,
    ClaimQuestRewardResponse,
    AdminLeaderboardOverview,
} from '../types/leaderboard.types';

export const leaderboardService = {
    async getOverview(
        category: LeaderboardCategory = 'diligence',
        period: LeaderboardPeriod = 'week',
        signal?: AbortSignal
    ): Promise<LeaderboardOverview> {
        const response = await axiosInstance.get<LeaderboardOverview>(ApiRouters.LEADERBOARD.BASE, {
            params: { category, period },
            signal,
        });
        return response.data;
    },

    async getAdminSummary(
        category: LeaderboardCategory = 'diligence',
        period: LeaderboardPeriod = 'week',
        signal?: AbortSignal
    ): Promise<AdminLeaderboardOverview> {
        const response = await axiosInstance.get<AdminLeaderboardOverview>(
            ApiRouters.LEADERBOARD.ADMIN_SUMMARY,
            {
                params: { category, period },
                signal,
            }
        );
        return response.data;
    },

    async getBadges(signal?: AbortSignal): Promise<BadgeItem[]> {
        const response = await axiosInstance.get<BadgeItem[]>(ApiRouters.LEADERBOARD.BADGES, { signal });
        return response.data;
    },

    async getWeeklyQuests(signal?: AbortSignal): Promise<WeeklyQuest[]> {
        const response = await axiosInstance.get<WeeklyQuest[]>(ApiRouters.LEADERBOARD.QUESTS, { signal });
        return response.data;
    },

    async claimQuestReward(questId: string): Promise<ClaimQuestRewardResponse> {
        const response = await axiosInstance.post<ClaimQuestRewardResponse>(
            ApiRouters.LEADERBOARD.CLAIM_QUEST(questId)
        );
        return response.data;
    },
};
