import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Skeleton } from 'antd';
import { useUserProfileQuery } from '@/features/students';
import { useMyPracticeSessionsQuery } from '@/features/exam-taking';
import { palette, skillMeta } from '../constants/gamification.constants';
import {
    getSkillKey,
    isFinished,
    getSessionScore,
    parseDateMs,
    getDurationMinutes,
    formatShortDate,
    getAiAdvice,
} from '../utils/gamification.utils';
import { progressStyles } from '../components/progress/progress.styles';
import { ProgressStatsOverview } from '../components/progress/ProgressStatsOverview';
import { ProgressPerformanceChart } from '../components/progress/ProgressPerformanceChart';
import { ProgressSkillBreakdown } from '../components/progress/ProgressSkillBreakdown';
import { ProgressHistoryTable } from '../components/progress/ProgressHistoryTable';

export const ClientProgressPage: React.FC = () => {
    const navigate = useNavigate();
    const { data: profile, isLoading: isProfileLoading } = useUserProfileQuery();
    const { data: pagedSessions, isLoading: isSessionsLoading } = useMyPracticeSessionsQuery({ pageSize: 100 });
    const sessions = pagedSessions?.items ?? [];

    const [chartSkill, setChartSkill] = useState<string>('ALL');
    const [historySkill, setHistorySkill] = useState<string>('ALL');

    const finishedSessions = useMemo(() => sessions.filter(isFinished), [sessions]);

    const stats = useMemo(() => {
        const totalMinutes = finishedSessions.reduce((sum, s) => sum + getDurationMinutes(s), 0);
        const scores = finishedSessions.map(getSessionScore).filter((s): s is number => s !== null);
        const bestBand = scores.length > 0 ? Math.max(...scores) : null;
        const averageBand = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

        const skillsDone = new Set(finishedSessions.map((s) => getSkillKey(s.skillType)));

        return {
            totalMinutes,
            completedCount: finishedSessions.length,
            bestBand,
            averageBand,
            skillsDoneCount: skillsDone.size,
            allSkillsAttempted: skillsDone.size === 4,
        };
    }, [finishedSessions]);

    const activeChartColor = useMemo(() => {
        if (chartSkill === 'ALL') return palette.indigo;
        const key = getSkillKey(chartSkill);
        return skillMeta[key]?.color ?? palette.indigo;
    }, [chartSkill]);

    const chartData = useMemo(() => {
        const filtered = finishedSessions.filter(
            (s) => chartSkill === 'ALL' || getSkillKey(s.skillType) === chartSkill
        );
        return filtered
            .map((s) => ({
                date: formatShortDate(s.endedAt),
                band: getSessionScore(s) ?? 0,
                title: s.examTitle,
                completedAt: s.endedAt ?? s.startedAt,
            }))
            .sort((a, b) => parseDateMs(a.completedAt) - parseDateMs(b.completedAt))
            .slice(-10);
    }, [finishedSessions, chartSkill]);


    const skillAnalytics = useMemo(() => {
        return (['READING', 'LISTENING', 'WRITING', 'SPEAKING'] as const).map((key) => {
            const skillSessions = finishedSessions.filter((s) => getSkillKey(s.skillType) === key);
            const scores = skillSessions.map(getSessionScore).filter((s): s is number => s !== null);
            const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
            const best = scores.length > 0 ? Math.max(...scores) : null;

            let extraMetric: string | null = null;
            if (key === 'READING' || key === 'LISTENING') {
                const totalCorrect = skillSessions.reduce((sum, s) => sum + (s.totalAutoScore ?? 0), 0);
                const totalQs = skillSessions.reduce((sum, s) => sum + (s.totalQuestions ?? 0), 0);
                extraMetric = totalQs > 0
                    ? `Độ chính xác: ${Math.round((totalCorrect / totalQs) * 100)}%`
                    : null;
            }

            return {
                key,
                ...skillMeta[key],
                attempts: skillSessions.length,
                avgScore: avg,
                bestScore: best,
                extraMetric,
                advice: getAiAdvice(key, avg),
            };
        });
    }, [finishedSessions]);

    const tableData = useMemo(() => {
        return finishedSessions
            .filter((s) => historySkill === 'ALL' || getSkillKey(s.skillType) === historySkill)
            .map((s) => ({
                key: s.sessionId,
                title: s.examTitle,
                skill: getSkillKey(s.skillType),
                score: getSessionScore(s),
                duration: getDurationMinutes(s),
                completedAt: s.endedAt ?? s.startedAt,
            }))
            .sort((a, b) => parseDateMs(b.completedAt) - parseDateMs(a.completedAt));
    }, [finishedSessions, historySkill]);

    const isLoading = isProfileLoading || isSessionsLoading;

    if (isLoading) {
        return (
            <div className="progress-shell">
                <style>{progressStyles}</style>
                <div className="progress-skeleton">
                    <Skeleton active paragraph={{ rows: 3 }} />
                    <div className="skeleton-cards">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <Skeleton.Node key={i} active style={{ width: '100%', height: 120, borderRadius: 12 }} />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="progress-shell">
            <style>{progressStyles}</style>

            <ProgressStatsOverview
                stats={stats}
                dailyStreakCount={profile?.gamification.dailyStreakCount ?? 0}
                longestStreakCount={profile?.gamification.longestStreakCount ?? 0}
            />

            <ProgressPerformanceChart
                chartSkill={chartSkill}
                onChangeChartSkill={setChartSkill}
                chartData={chartData}
                activeChartColor={activeChartColor}
            />

            <ProgressSkillBreakdown skillAnalytics={skillAnalytics} />


            <ProgressHistoryTable
                historySkill={historySkill}
                onChangeHistorySkill={setHistorySkill}
                tableData={tableData}
                onNavigateToSessionSubmit={(sessionId) => navigate(`/app/sessions/${sessionId}/submit`)}
            />
        </div>
    );
};

export const ProgressPage = ClientProgressPage;
