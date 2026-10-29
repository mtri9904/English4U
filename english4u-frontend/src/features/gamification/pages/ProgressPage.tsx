import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageLoadingState, PageErrorState } from '@/components';
import { useClientProgressQuery } from '@/features/client/hooks/useDashboardQueries';
import { palette, skillMeta } from '../constants/gamification.constants';
import { getSkillKey, parseDateMs } from '../utils/gamification.utils';
import { progressStyles } from '../components/progress/progress.styles';
import { ProgressStatsOverview } from '../components/progress/ProgressStatsOverview';
import { ProgressPerformanceChart } from '../components/progress/ProgressPerformanceChart';
import { ProgressSkillBreakdown } from '../components/progress/ProgressSkillBreakdown';
import { ProgressHistoryTable } from '../components/progress/ProgressHistoryTable';

export const ClientProgressPage: React.FC = () => {
    const navigate = useNavigate();
    const { data: progress, isLoading, isError, refetch } = useClientProgressQuery();

    const [chartSkill, setChartSkill] = useState<string>('ALL');
    const [historySkill, setHistorySkill] = useState<string>('ALL');

    const stats = progress?.stats ?? {
        totalMinutes: 0,
        completedCount: 0,
        bestBand: null,
        averageBand: null,
        skillsDoneCount: 0,
        allSkillsAttempted: false,
        dailyStreakCount: 0,
        longestStreakCount: 0,
    };

    const activeChartColor = useMemo(() => {
        if (chartSkill === 'ALL') return palette.indigo;
        const key = getSkillKey(chartSkill);
        return skillMeta[key]?.color ?? palette.indigo;
    }, [chartSkill]);

    const chartData = useMemo(() => {
        const raw = progress?.chartData ?? [];
        const filtered = raw.filter(
            (s) => chartSkill === 'ALL' || getSkillKey(s.skill) === chartSkill
        );
        return filtered
            .map((s) => ({
                date: s.date,
                band: s.band,
                title: s.title,
                completedAt: s.completedAt,
            }))
            .sort((a, b) => parseDateMs(a.completedAt) - parseDateMs(b.completedAt))
            .slice(-10);
    }, [progress?.chartData, chartSkill]);

    const skillAnalytics = useMemo(() => {
        const raw = progress?.skillAnalytics ?? [];
        return (['READING', 'LISTENING', 'WRITING', 'SPEAKING'] as const).map((key) => {
            const found = raw.find((item) => getSkillKey(item.key) === key);
            return {
                key,
                ...skillMeta[key],
                attempts: found?.attempts ?? 0,
                avgScore: found?.avgScore ?? null,
                bestScore: found?.bestScore ?? null,
                extraMetric: found?.extraMetric ?? null,
                advice: found?.advice ?? 'Hãy hoàn thành bài thi thử đầu tiên để nhận đánh giá chi tiết từ trợ lý học tập.',
            };
        });
    }, [progress?.skillAnalytics]);

    const tableData = useMemo(() => {
        const raw = progress?.history ?? [];
        return raw
            .filter((s) => historySkill === 'ALL' || getSkillKey(s.skill) === historySkill)
            .map((s) => ({
                key: s.key,
                title: s.title,
                skill: getSkillKey(s.skill),
                score: s.score,
                duration: s.duration,
                completedAt: s.completedAt,
            }))
            .sort((a, b) => parseDateMs(b.completedAt) - parseDateMs(a.completedAt));
    }, [progress?.history, historySkill]);

    if (isLoading) {
        return (
            <div className="progress-shell">
                <style>{progressStyles}</style>
                <PageLoadingState type="skeleton" tip="Đang nạp dữ liệu tiến độ học tập..." rows={8} />
            </div>
        );
    }

    if (isError && !progress) {
        return (
            <div className="progress-shell">
                <style>{progressStyles}</style>
                <PageErrorState
                    title="Không thể tải dữ liệu tiến độ"
                    subTitle="Đã có lỗi xảy ra khi nạp lịch sử luyện thi hoặc thông tin cá nhân."
                    onRetry={() => refetch()}
                />
            </div>
        );
    }

    return (
        <div className="progress-shell">
            <style>{progressStyles}</style>

            <ProgressStatsOverview
                stats={stats}
                dailyStreakCount={stats.dailyStreakCount}
                longestStreakCount={stats.longestStreakCount}
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
