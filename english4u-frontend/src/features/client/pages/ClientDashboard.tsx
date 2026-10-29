import React, { useMemo } from 'react';
import {
    Button,
    Empty,
    Skeleton,
    Tag,
    Typography,
} from 'antd';
import {
    CheckCircleOutlined,
    PlayCircleOutlined,
    RightOutlined,
    TrophyOutlined,
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { DashboardHeroBanner } from '../components/dashboard/DashboardHeroBanner';
import { DashboardSummaryStrip } from '../components/dashboard/DashboardSummaryStrip';
import { DashboardRadarCard } from '../components/dashboard/DashboardRadarCard';
import { PageErrorState } from '@/components';
import { dashboardStyles } from '../components/dashboard/dashboard.styles';
import { useUserProfileQuery } from '@/features/students';
import { useClientDashboardQuery } from '../hooks/useDashboardQueries';
import { getSessionRunnerPath } from '@/features/exam-taking';
import { getStreakDisplayMeta } from '@/features/gamification';
import { formatDateTimeToMinute } from '@/shared/lib/dateTime';

const { Title, Text } = Typography;

import {
    WEEKLY_GOAL,
    palette,
    skillMeta,
    cardMotion,
} from '../constants/client.constants';
import {
    fadeIn,
    getFirstName,
    formatMinutes,
    getSkillKey,
} from '../utils/client.utils';

export const ClientDashboard: React.FC = () => {
    const navigate = useNavigate();
    const { data: profile, isLoading: isProfileLoading, isError: isProfileError, refetch: refetchProfile } = useUserProfileQuery();
    const { data: dashboard, isLoading: isDashboardLoading, isError: isDashboardError, refetch: refetchDashboard } = useClientDashboardQuery();

    const isLoading = isProfileLoading || isDashboardLoading;
    const isError = (isProfileError || isDashboardError) && !dashboard;

    const streak = profile?.gamification.dailyStreakCount ?? 0;
    const longestStreak = profile?.gamification.longestStreakCount ?? 0;
    const streakMeta = getStreakDisplayMeta(streak);
    const firstName = getFirstName(profile?.displayName);
    const recentActivities = dashboard?.recentActivities ?? [];
    const lastCompletedActivity = recentActivities.find((a) => a.status === 'Completed');

    const activeSession = dashboard?.activeSession ?? null;
    const summary = dashboard?.summary;

    const weakestSkill = useMemo(() => {
        if (!dashboard?.weakestSkill) return null;
        const skillKey = getSkillKey(dashboard.weakestSkill);
        const row = dashboard.skillRows.find((r) => r.skill === dashboard.weakestSkill);
        return {
            skill: dashboard.weakestSkill,
            label: skillMeta[skillKey]?.label ?? dashboard.weakestSkill,
            averageBand: row?.averageBand ?? null,
        };
    }, [dashboard]);

    const skillRows = useMemo(() => {
        if (!dashboard) return [];
        return dashboard.skillRows.map((r) => {
            const skillKey = getSkillKey(r.skill);
            return {
                ...r,
                ...skillMeta[skillKey],
            };
        });
    }, [dashboard]);

    const radarData = dashboard?.radarData ?? [];
    const fluencyTrendData = dashboard?.fluencyTrend ?? [];
    const scoredBands = useMemo(() => {
        return skillRows
            .map((r) => r.averageBand)
            .filter((b): b is number => b != null);
    }, [skillRows]);

    const completedThisWeek = summary?.completedThisWeek ?? 0;
    const weeklyGoal = summary?.weeklyGoal ?? WEEKLY_GOAL;
    const weeklyProgress = summary?.weeklyProgress ?? 0;
    const totalMinutes = summary?.totalMinutes ?? 0;
    const completedCount = summary?.completedCount ?? 0;
    const uniqueExamCount = summary?.uniqueExamCount ?? 0;
    const bestBand = summary?.bestBand ?? null;

    const plannerTasks = [
        {
            title: activeSession ? 'Tiếp tục mock test đang dở' : weakestSkill ? `Làm 1 bài ${weakestSkill.label}` : 'Làm 1 bài Reading',
            note: activeSession
                ? `${activeSession.answeredQuestions}/${activeSession.totalQuestions} câu đã trả lời`
                : weakestSkill
                    ? `Điểm hiện tại ${weakestSkill.averageBand != null && weakestSkill.averageBand > 0 ? weakestSkill.averageBand.toFixed(1) : '–'}`
                    : 'Tạo dữ liệu đầu tiên cho dashboard',
            action: activeSession ? 'Tiếp tục' : 'Bắt đầu',
            done: false,
            onClick: () => {
                if (activeSession) {
                    navigate(getSessionRunnerPath(activeSession.sessionId, activeSession.skillType));
                    return;
                }

                navigate(`/app/practice${weakestSkill ? `?skill=${weakestSkill.skill}` : ''}`);
            },
        },
        {
            title: 'Xem lại feedback AI gần nhất',
            note: lastCompletedActivity ? lastCompletedActivity.examTitle : 'Chưa có bài thi hoàn thành',
            action: 'Xem',
            done: !lastCompletedActivity,
            onClick: () => {
                if (lastCompletedActivity) {
                    navigate(`/app/sessions/${lastCompletedActivity.sessionId}/submit`);
                }
            },
        },
        {
            title: 'Hoàn thành mục tiêu tuần',
            note: `${completedThisWeek}/${weeklyGoal} bài đã hoàn thành (${weeklyProgress}%)`,
            action: 'Luyện',
            done: completedThisWeek >= weeklyGoal,
            onClick: () => navigate('/app/practice'),
        },
    ];

    const summaryItems = [
        {
            label: 'Điểm cao nhất',
            value: bestBand != null && bestBand > 0 ? bestBand.toFixed(1) : '–',
            detail: `${uniqueExamCount} đề đã luyện`,
            icon: <TrophyOutlined />,
            color: palette.green,
        },
        {
            label: 'Daily Streak',
            value: `${streak} ngày`,
            detail: streakMeta.description,
            icon: <span style={{ fontSize: 16 }}>🔥</span>,
            color: palette.orange,
        },
        {
            label: 'Practice Time',
            value: formatMinutes(totalMinutes),
            detail: `${completedCount} bài hoàn thành`,
            icon: <PlayCircleOutlined />,
            color: palette.cyan,
        },
    ];

    if (isLoading) {
        return (
            <div className="dashboard-shell">
                <style>{dashboardStyles}</style>
                <div className="dashboard-skeleton">
                    <Skeleton active paragraph={{ rows: 4 }} />
                    <div className="skeleton-grid">
                        {Array.from({ length: 6 }, (_, index) => (
                            <Skeleton.Node key={index} active className="skeleton-node" />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (isError) {
        return (
            <div className="dashboard-shell">
                <style>{dashboardStyles}</style>
                <div style={{ maxWidth: 640, margin: '60px auto' }}>
                    <PageErrorState
                        title="Không thể tải bảng điều khiển"
                        subTitle="Đã có lỗi xảy ra khi nạp thông tin học viên. Vui lòng thử lại."
                        onRetry={() => {
                            refetchProfile();
                            refetchDashboard();
                        }}
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="dashboard-shell">
            <style>{dashboardStyles}</style>

            <DashboardHeroBanner
                profile={profile}
                firstName={firstName}
                streakMeta={streakMeta}
                longestStreak={longestStreak}
                activeSession={activeSession}
                weakestSkill={weakestSkill}
                onNavigate={navigate}
            />

            <DashboardSummaryStrip summaryItems={summaryItems} />

            <section className="bento-grid">
                <DashboardRadarCard
                    scoredBands={scoredBands}
                    radarData={radarData}
                    skillRows={skillRows}
                />

                <motion.div className="bento-card bento-planner glass-card" {...fadeIn(0.14)} {...cardMotion}>
                    <div className="card-head compact">
                        <div>
                            <Text className="eyebrow">AI Study Planner</Text>
                            <Title level={4} className="card-title">Nhiệm vụ hôm nay</Title>
                        </div>
                    </div>

                    <div className="planner-list">
                        {plannerTasks.map((task, index) => (
                            <button
                                key={task.title}
                                type="button"
                                className="planner-item"
                                onClick={task.onClick}
                                disabled={task.done && task.title !== 'Xem lại feedback AI gần nhất'}
                            >
                                <span className={task.done ? 'planner-index done' : 'planner-index'}>
                                    {task.done ? <CheckCircleOutlined /> : index + 1}
                                </span>
                                <span className="planner-copy">
                                    <strong>{task.title}</strong>
                                    <small>{task.note}</small>
                                </span>
                                <span className="planner-action">{task.action}</span>
                            </button>
                        ))}
                    </div>
                </motion.div>

                <motion.div className="bento-card bento-fluency glass-card" {...fadeIn(0.18)} {...cardMotion}>
                    <div className="card-head compact">
                        <div>
                            <Text className="eyebrow">Fluency Trend</Text>
                            <Title level={4} className="card-title">WPM Speaking</Title>
                        </div>
                        <Tag className="soft-pill">{fluencyTrendData.length} bài</Tag>
                    </div>

                    {isLoading ? (
                        <Skeleton active paragraph={{ rows: 4 }} />
                    ) : fluencyTrendData.length === 0 ? (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có WPM từ bài Speaking." />
                    ) : (
                        <ResponsiveContainer width="100%" height={210}>
                            <LineChart data={fluencyTrendData}>
                                <CartesianGrid strokeDasharray="4 4" stroke="rgba(148, 163, 184, 0.2)" />
                                <XAxis dataKey="label" tick={{ fill: palette.muted, fontSize: 12 }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fill: palette.muted, fontSize: 12 }} axisLine={false} tickLine={false} width={34} />
                                <Tooltip />
                                <Line
                                    type="monotone"
                                    dataKey="wpm"
                                    name="WPM"
                                    stroke={palette.green}
                                    strokeWidth={3}
                                    dot={{ r: 4, fill: '#fff', stroke: palette.green, strokeWidth: 2 }}
                                    activeDot={{ r: 6 }}
                                    isAnimationActive
                                    animationDuration={900}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    )}
                </motion.div>

                <motion.div className="bento-card bento-vocab glass-card" {...fadeIn(0.22)} {...cardMotion}>
                    <Text className="eyebrow">Vocab Reminder</Text>
                    <Title level={4} className="card-title">Flashcard</Title>
                    <div className="flashcard-box">
                        <Text className="flashcard-label">Từ cần ôn</Text>
                        <div className="flashcard-word">Academic</div>
                        <Text className="flashcard-note">Card đã để sẵn, sẽ nối dữ liệu từ lỗi vocab sau.</Text>
                    </div>
                </motion.div>

                <motion.div className="bento-card bento-recent glass-card" {...fadeIn(0.26)} {...cardMotion}>
                    <div className="card-head compact">
                        <div>
                            <Text className="eyebrow">Recent Mock Tests</Text>
                            <Title level={4} className="card-title">Bài thi gần đây</Title>
                        </div>
                        <Button type="link" onClick={() => navigate('/app/my-exams')}>View all</Button>
                    </div>

                    {recentActivities.length === 0 ? (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có bài thi gần đây." />
                    ) : (
                        <div className="recent-list">
                            {recentActivities.slice(0, 4).map((item) => {
                                const skill = getSkillKey(item.skillType);
                                const tone = skillMeta[skill];
                                const isInProgress = item.status === 'InProgress';

                                return (
                                    <button
                                        key={item.sessionId}
                                        type="button"
                                        className="recent-item"
                                        onClick={() => {
                                            if (isInProgress) {
                                                navigate(getSessionRunnerPath(item.sessionId, item.skillType));
                                                return;
                                            }
                                            navigate(`/app/sessions/${item.sessionId}/submit`);
                                        }}
                                    >
                                        <span className="recent-icon" style={{ color: tone?.color, background: tone?.tint }}>
                                            {tone?.icon}
                                        </span>
                                        <span className="recent-copy">
                                            <strong>{item.examTitle}</strong>
                                            <small>{formatDateTimeToMinute(item.completedAt) || item.completedAt}</small>
                                        </span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifySelf: 'end' }}>
                                            {item.bandScore != null && item.bandScore > 0 && (
                                                <span
                                                    style={{
                                                        fontWeight: 800,
                                                        color: palette.indigo,
                                                        fontSize: 12,
                                                        background: 'rgba(79, 70, 229, 0.08)',
                                                        padding: '2px 8px',
                                                        borderRadius: 6,
                                                    }}
                                                >
                                                    {item.bandScore.toFixed(1)} đ
                                                </span>
                                            )}
                                            {isInProgress ? (
                                                <Tag color="warning" style={{ borderRadius: 6, fontWeight: 700, margin: 0, padding: '2px 8px' }}>
                                                    Đang làm
                                                </Tag>
                                            ) : item.status === 'Submitted' ? (
                                                <Tag color="processing" style={{ borderRadius: 6, fontWeight: 600, margin: 0, padding: '2px 8px' }}>
                                                    Đang chấm
                                                </Tag>
                                            ) : item.status === 'Abandoned' ? (
                                                <Tag style={{ borderRadius: 6, fontWeight: 500, margin: 0, padding: '2px 8px' }}>
                                                    Đã hủy
                                                </Tag>
                                            ) : (
                                                <Tag color="success" style={{ borderRadius: 6, fontWeight: 600, margin: 0, padding: '2px 8px' }}>
                                                    Hoàn thành
                                                </Tag>
                                            )}
                                        </div>
                                        <RightOutlined className="recent-arrow" />
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </motion.div>


            </section>
        </div>
    );
};
