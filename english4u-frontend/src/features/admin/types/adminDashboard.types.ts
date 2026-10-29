import type { AdminAttemptListItemDto } from '@/features/attempts';

export interface AdminDashboardUserStatsDto {
    totalUsers: number;
    activeUsers: number;
    onlineUsers: number;
    globalAverageScore: number;
    premiumUsers: number;
}

export interface AdminExamTypeCountDto {
    name: string;
    count: number;
}

export interface AdminSkillAttemptCountDto {
    name: string;
    value: number;
}

export interface AdminTopExamDto {
    title: string;
    type: string;
    count: number;
}

export interface AdminDashboardDto {
    userStats: AdminDashboardUserStatsDto;
    publishedExamsCount: number;
    draftExamsCount: number;
    attemptsCount: number;
    completedAttempts: number;
    inProgressAttempts: number;
    abandonedAttempts: number;
    examByType: AdminExamTypeCountDto[];
    attemptsBySkill: AdminSkillAttemptCountDto[];
    topExams: AdminTopExamDto[];
    recentAttempts: AdminAttemptListItemDto[];
}

