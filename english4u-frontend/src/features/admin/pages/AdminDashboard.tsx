import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAdminStatsQuery } from '@/features/students';
import { useExamsQuery } from '@/features/exams';
import { useAdminAttemptsQuery } from '@/features/attempts';
import { container, skillLabel } from '../constants/admin.constants';
import {
    AdminDashboardHeader,
    AdminStatCards,
    AdminAnalyticsCharts,
    AdminTopExamsCard,
    AdminRecentAttemptsCard,
    AdminQuickActionsCard,
} from '../components/dashboard';

export const AdminDashboard = () => {
    const navigate = useNavigate();

    const { data: userStats, isLoading: isUserStatsLoading } = useAdminStatsQuery();
    const { data: pagedExams, isLoading: isExamsLoading } = useExamsQuery({ pageSize: 100 });
    const exams = pagedExams?.items ?? [];
    const { data: pagedAttempts, isLoading: isAttemptsLoading } = useAdminAttemptsQuery({ pageSize: 100 });
    const attempts = pagedAttempts?.items ?? [];

    const publishedExams = useMemo(() => exams.filter((e) => e.isPublished), [exams]);
    const draftExams = useMemo(() => exams.filter((e) => !e.isPublished), [exams]);

    const examByType = useMemo(() => {
        const map: Record<string, number> = {};
        for (const e of exams) {
            const t = e.examType || 'Khác';
            map[t] = (map[t] || 0) + 1;
        }
        return Object.entries(map).map(([name, count]) => ({ name, count }));
    }, [exams]);

    const attemptsBySkill = useMemo(() => {
        const map: Record<string, number> = {};
        for (const a of attempts) {
            const skill = skillLabel[a.skillType] || a.skillType || 'Khác';
            map[skill] = (map[skill] || 0) + 1;
        }
        return Object.entries(map).map(([name, value]) => ({ name, value }));
    }, [attempts]);

    const completedAttempts = useMemo(
        () => attempts.filter((a) => a.status?.toLowerCase() === 'completed').length,
        [attempts]
    );
    const inProgressAttempts = useMemo(
        () => attempts.filter((a) => a.status?.toLowerCase() === 'in_progress').length,
        [attempts]
    );
    const abandonedAttempts = useMemo(
        () => attempts.filter((a) => a.status?.toLowerCase() === 'abandoned').length,
        [attempts]
    );

    const recentAttempts = useMemo(
        () =>
            [...attempts]
                .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
                .slice(0, 6),
        [attempts]
    );

    const topExams = useMemo(() => {
        const map: Record<string, { title: string; type: string; count: number }> = {};
        for (const a of attempts) {
            if (!map[a.examId]) map[a.examId] = { title: a.examTitle, type: a.examType ?? 'N/A', count: 0 };
            map[a.examId].count++;
        }
        return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 5);
    }, [attempts]);

    return (
        <motion.div variants={container} initial="hidden" animate="show" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            <AdminDashboardHeader onCreateExam={() => navigate('/admin/exams')} />

            <AdminStatCards
                userStats={userStats}
                isUserStatsLoading={isUserStatsLoading}
                publishedExamsCount={publishedExams.length}
                draftExamsCount={draftExams.length}
                isExamsLoading={isExamsLoading}
                attemptsCount={attempts.length}
                completedAttempts={completedAttempts}
                inProgressAttempts={inProgressAttempts}
                isAttemptsLoading={isAttemptsLoading}
            />

            <AdminAnalyticsCharts
                isExamsLoading={isExamsLoading}
                examByType={examByType}
                isAttemptsLoading={isAttemptsLoading}
                attemptsBySkill={attemptsBySkill}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20, alignItems: 'start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <AdminTopExamsCard
                        isLoading={isAttemptsLoading}
                        topExams={topExams}
                        onViewAll={() => navigate('/admin/exams')}
                    />

                    <AdminRecentAttemptsCard
                        isLoading={isAttemptsLoading}
                        recentAttempts={recentAttempts}
                        onViewAll={() => navigate('/admin/attempts')}
                    />
                </div>

                <AdminQuickActionsCard
                    completedAttempts={completedAttempts}
                    inProgressAttempts={inProgressAttempts}
                    abandonedAttempts={abandonedAttempts}
                    draftExamsCount={draftExams.length}
                    onNavigate={navigate}
                />
            </div>

            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.6; transform: scale(1.3); }
                }
            `}</style>
        </motion.div>
    );
};
