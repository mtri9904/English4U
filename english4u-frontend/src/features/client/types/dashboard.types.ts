export interface ClientDashboardActiveSessionDto {
    sessionId: string;
    examId: string;
    examTitle: string;
    skillType: string;
    status: string;
    answeredQuestions: number;
    totalQuestions: number;
    timeRemaining: number | null;
    startedAt: string;
}

export interface ClientDashboardSummaryDto {
    completedCount: number;
    completedThisWeek: number;
    weeklyGoal: number;
    weeklyProgress: number;
    totalMinutes: number;
    uniqueExamCount: number;
    averageBand: number | null;
    bestBand: number | null;
    estimatedOverallBand: number | null;
}

export interface ClientDashboardSkillRowDto {
    skill: string;
    attempts: number;
    completed: number;
    averageBand: number | null;
    bestBand: number | null;
}

export interface ClientDashboardRadarPointDto {
    skill: string;
    fullSkill: string;
    band: number;
}

export interface ClientDashboardFluencyPointDto {
    label: string;
    wpm: number;
    examTitle: string;
    completedAt: string;
}

export interface ClientDashboardRecentActivityDto {
    sessionId: string;
    examId: string;
    examTitle: string;
    skillType: string;
    status: string;
    bandScore: number | null;
    completedAt: string;
}

export interface ClientDashboardDto {
    activeSession: ClientDashboardActiveSessionDto | null;
    summary: ClientDashboardSummaryDto;
    weakestSkill: string | null;
    skillRows: ClientDashboardSkillRowDto[];
    radarData: ClientDashboardRadarPointDto[];
    fluencyTrend: ClientDashboardFluencyPointDto[];
    recentActivities: ClientDashboardRecentActivityDto[];
}

// --- Progress DTOs ---
export interface ClientProgressStatsDto {
    totalMinutes: number;
    completedCount: number;
    bestBand: number | null;
    averageBand: number | null;
    skillsDoneCount: number;
    allSkillsAttempted: boolean;
    dailyStreakCount: number;
    longestStreakCount: number;
}

export interface ClientProgressChartPointDto {
    sessionId: string;
    date: string;
    band: number;
    title: string;
    skill: string;
    completedAt: string;
}

export interface ClientProgressSkillAnalyticsDto {
    key: string;
    attempts: number;
    avgScore: number | null;
    bestScore: number | null;
    extraMetric: string | null;
    advice: string;
}

export interface ClientProgressHistoryItemDto {
    key: string;
    title: string;
    skill: string;
    score: number | null;
    duration: number;
    completedAt: string;
}

export interface ClientProgressDto {
    stats: ClientProgressStatsDto;
    chartData: ClientProgressChartPointDto[];
    skillAnalytics: ClientProgressSkillAnalyticsDto[];
    history: ClientProgressHistoryItemDto[];
}
