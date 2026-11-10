import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { message } from 'antd';
import { leaderboardService } from '../services/leaderboard.service';
import type { LeaderboardCategory, LeaderboardPeriod } from '../types/leaderboard.types';

export const LEADERBOARD_QUERY_KEYS = {
    all: ['leaderboard'] as const,
    overview: (category: LeaderboardCategory, period: LeaderboardPeriod) =>
        ['leaderboard', 'overview', category, period] as const,
    adminSummary: (category: LeaderboardCategory, period: LeaderboardPeriod) =>
        ['leaderboard', 'adminSummary', category, period] as const,
    badges: ['leaderboard', 'badges'] as const,
    quests: ['leaderboard', 'quests'] as const,
};

export const useLeaderboardOverviewQuery = (
    category: LeaderboardCategory = 'diligence',
    period: LeaderboardPeriod = 'week'
) => {
    return useQuery({
        queryKey: LEADERBOARD_QUERY_KEYS.overview(category, period),
        queryFn: ({ signal }) => leaderboardService.getOverview(category, period, signal),
        staleTime: 0,
        refetchOnMount: 'always',
        refetchOnWindowFocus: false,
    });
};

export const useAdminLeaderboardOverviewQuery = (
    category: LeaderboardCategory = 'diligence',
    period: LeaderboardPeriod = 'week'
) => {
    return useQuery({
        queryKey: LEADERBOARD_QUERY_KEYS.adminSummary(category, period),
        queryFn: ({ signal }) => leaderboardService.getAdminSummary(category, period, signal),
        staleTime: 0,
        refetchOnMount: 'always',
        refetchOnWindowFocus: false,
    });
};

export const useUserBadgesQuery = () => {
    return useQuery({
        queryKey: LEADERBOARD_QUERY_KEYS.badges,
        queryFn: ({ signal }) => leaderboardService.getBadges(signal),
        staleTime: 0,
        refetchOnMount: 'always',
    });
};

export const useWeeklyQuestsQuery = () => {
    return useQuery({
        queryKey: LEADERBOARD_QUERY_KEYS.quests,
        queryFn: ({ signal }) => leaderboardService.getWeeklyQuests(signal),
        staleTime: 0,
        refetchOnMount: 'always',
    });
};

export const useClaimQuestRewardMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (questId: string) => leaderboardService.claimQuestReward(questId),
        onSuccess: (data) => {
            if (data.success) {
                message.success({
                    content: `🎉 ${data.message}`,
                    duration: 4,
                });
                queryClient.invalidateQueries({ queryKey: LEADERBOARD_QUERY_KEYS.all });
            } else {
                message.warning(data.message);
            }
        },
        onError: (err: any) => {
            message.error(err?.response?.data?.message || 'Không thể nhận phần thưởng. Vui lòng thử lại sau.');
        },
    });
};
