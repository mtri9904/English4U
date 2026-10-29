import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { container } from '../constants/admin.constants';
import {
    AdminDashboardHeader,
    AdminStatCards,
    AdminAnalyticsCharts,
    AdminTopExamsCard,
    AdminRecentAttemptsCard,
    AdminQuickActionsCard,
} from '../components/dashboard';
import { useAdminDashboardQuery } from '../hooks/useAdminDashboardQuery';

export const AdminDashboard = () => {
    const navigate = useNavigate();

    const { data: dashboard, isLoading } = useAdminDashboardQuery();

    const userStats = dashboard?.userStats;
    const publishedExamsCount = dashboard?.publishedExamsCount ?? 0;
    const draftExamsCount = dashboard?.draftExamsCount ?? 0;
    const attemptsCount = dashboard?.attemptsCount ?? 0;
    const completedAttempts = dashboard?.completedAttempts ?? 0;
    const inProgressAttempts = dashboard?.inProgressAttempts ?? 0;
    const abandonedAttempts = dashboard?.abandonedAttempts ?? 0;
    const examByType = dashboard?.examByType ?? [];
    const attemptsBySkill = dashboard?.attemptsBySkill ?? [];
    const topExams = dashboard?.topExams ?? [];
    const recentAttempts = dashboard?.recentAttempts ?? [];

    return (
        <motion.div variants={container} initial="hidden" animate="show" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            <AdminDashboardHeader onCreateExam={() => navigate('/admin/exams')} />

            <AdminStatCards
                userStats={userStats}
                isUserStatsLoading={isLoading}
                publishedExamsCount={publishedExamsCount}
                draftExamsCount={draftExamsCount}
                isExamsLoading={isLoading}
                attemptsCount={attemptsCount}
                completedAttempts={completedAttempts}
                inProgressAttempts={inProgressAttempts}
                isAttemptsLoading={isLoading}
            />

            <AdminAnalyticsCharts
                isExamsLoading={isLoading}
                examByType={examByType}
                isAttemptsLoading={isLoading}
                attemptsBySkill={attemptsBySkill}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20, alignItems: 'start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <AdminTopExamsCard
                        isLoading={isLoading}
                        topExams={topExams}
                        onViewAll={() => navigate('/admin/exams')}
                    />

                    <AdminRecentAttemptsCard
                        isLoading={isLoading}
                        recentAttempts={recentAttempts}
                        onViewAll={() => navigate('/admin/attempts')}
                    />
                </div>

                <AdminQuickActionsCard
                    completedAttempts={completedAttempts}
                    inProgressAttempts={inProgressAttempts}
                    abandonedAttempts={abandonedAttempts}
                    draftExamsCount={draftExamsCount}
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
