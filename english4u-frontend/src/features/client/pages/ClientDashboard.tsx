import React, { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
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
import { dashboardStyles } from '../components/dashboard/dashboard.styles';
import { useUserProfileQuery } from '@/features/students';
import { formatDateTimeToMinute } from '@/shared/lib/dateTime';
import { sessionService as sessionApi, sessionKeys, useMyPracticeSessionsQuery } from '@/features/exam-taking';
import { getSessionRunnerPath, getSkillLabel } from '@/features/exam-taking';
import { getStreakDisplayMeta } from '@/features/gamification';

const { Title, Text } = Typography;

import {
    WEEKLY_GOAL,
    palette,
    skillMeta,
    cardMotion,
    SKILLS,
} from '../constants/client.constants';
import {
    fadeIn,
    parseDateMs,
    getSkillKey,
    isFinishedSession,
    getSessionBandScore,
    formatBand,
    formatShortDate,
    getFirstName,
    getSessionDurationMinutes,
    formatMinutes,
} from '../utils/client.utils';

export const ClientDashboard: React.FC = () => {
    const navigate = useNavigate();
    const { data: profile, isLoading: isProfileLoading } = useUserProfileQuery();
    const { data: pagedSessions, isLoading: isSessionsLoading } = useMyPracticeSessionsQuery({ pageSize: 100 });
    const sessions = pagedSessions?.items ?? [];

    const finishedSessions = useMemo(
        () => sessions.filter(isFinishedSession),
        [sessions],
    );

    const activeSession = useMemo(
        () => sessions
            .filter((session) => session.status === 'InProgress')
            .sort((left, right) => parseDateMs(right.startedAt) - parseDateMs(left.startedAt))[0] ?? null,
        [sessions],
    );

    const speakingSessionsForAnalytics = useMemo(
        () => finishedSessions
            .filter((session) => getSkillKey(session.skillType) === 'SPEAKING')
            .sort((left, right) => parseDateMs(right.endedAt) - parseDateMs(left.endedAt))
            .slice(0, 5),
        [finishedSessions],
    );

    const speakingDetailQueries = useQueries({
        queries: speakingSessionsForAnalytics.map((session) => ({
            queryKey: sessionKeys.detail(session.sessionId),
            queryFn: () => sessionApi.getSession(session.sessionId),
            staleTime: 5 * 60 * 1000,
            enabled: speakingSessionsForAnalytics.length > 0,
        })),
    });

    const skillRows = useMemo(
        () => SKILLS.map((skill) => {
            const all = sessions.filter((session) => getSkillKey(session.skillType) === skill);
            const completed = all.filter(isFinishedSession);
            const bands = completed
                .map(getSessionBandScore)
                .filter((score): score is number => score != null);
            const averageBand = bands.length > 0
                ? bands.reduce((total, score) => total + score, 0) / bands.length
                : null;
            const bestBand = bands.length > 0 ? Math.max(...bands) : null;

            return {
                skill,
                ...skillMeta[skill],
                attempts: all.length,
                completed: completed.length,
                averageBand,
                bestBand,
            };
        }),
        [sessions],
    );

    const scoredBands = useMemo(
        () => finishedSessions
            .map(getSessionBandScore)
            .filter((score): score is number => score != null),
        [finishedSessions],
    );

    const radarData = useMemo(
        () => skillRows.map((item) => ({
            skill: item.shortLabel,
            fullSkill: item.label,
            band: Number((item.averageBand ?? 0).toFixed(1)),
        })),
        [skillRows],
    );

    const fluencyTrendData = useMemo(
        () => speakingDetailQueries
            .map((query, index) => {
                const detail = query.data;
                const fallbackSession = speakingSessionsForAnalytics[index];
                if (!detail || !fallbackSession) return null;

                const wpmValues = detail.answers
                    .map((answer) => answer.speakingAnalytics?.wordsPerMinute)
                    .filter((value): value is number => value != null && value > 0);

                if (wpmValues.length === 0) return null;

                const averageWpm = wpmValues.reduce((total, value) => total + value, 0) / wpmValues.length;

                return {
                    label: formatShortDate(detail.endedAt ?? fallbackSession.endedAt),
                    wpm: Number(averageWpm.toFixed(1)),
                    examTitle: detail.examTitle,
                    completedAt: detail.endedAt ?? fallbackSession.endedAt ?? detail.startedAt,
                };
            })
            .filter((item): item is {
                label: string;
                wpm: number;
                examTitle: string;
                completedAt: string;
            } => item != null)
            .sort((left, right) => parseDateMs(left.completedAt) - parseDateMs(right.completedAt)),
        [speakingDetailQueries, speakingSessionsForAnalytics],
    );

    const weakestSkill = useMemo(
        () => skillRows
            .filter((item) => item.averageBand != null)
            .sort((left, right) => (left.averageBand ?? 0) - (right.averageBand ?? 0))[0] ?? null,
        [skillRows],
    );

    const completedThisWeek = useMemo(() => {
        const now = Date.now();
        const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

        return finishedSessions.filter((session) => {
            const endedAtMs = parseDateMs(session.endedAt);
            return endedAtMs >= sevenDaysAgo && endedAtMs <= now;
        }).length;
    }, [finishedSessions]);

    const totalMinutes = useMemo(
        () => finishedSessions.reduce((total, session) => total + getSessionDurationMinutes(session), 0),
        [finishedSessions],
    );

    const isLoading = isProfileLoading || isSessionsLoading;
    const streak = profile?.gamification.dailyStreakCount ?? 0;
    const longestStreak = profile?.gamification.longestStreakCount ?? 0;
    const streakMeta = getStreakDisplayMeta(streak);
    const completedCount = profile?.learning.completedSessionCount ?? finishedSessions.length;
    const uniqueExamCount = profile?.learning.uniqueExamCompletedCount ?? 0;
    const averageBand = profile?.learning.averageBandScore
        ?? (scoredBands.length > 0 ? scoredBands.reduce((total, score) => total + score, 0) / scoredBands.length : null);
    const estimatedOverallBand = averageBand ?? (scoredBands.length > 0 ? scoredBands[scoredBands.length - 1] : null);
    const bestBand = profile?.learning.bestBandScore
        ?? (scoredBands.length > 0 ? Math.max(...scoredBands) : null);
    const weeklyProgress = Math.min(100, Math.round((completedThisWeek / WEEKLY_GOAL) * 100));
    const firstName = getFirstName(profile?.displayName);
    const recentActivities = profile?.recentExamActivities ?? [];

    const plannerTasks = [
        {
            title: activeSession ? 'Tiếp tục mock test đang dở' : weakestSkill ? `Làm 1 bài ${weakestSkill.label}` : 'Làm 1 bài Reading',
            note: activeSession
                ? `${activeSession.answeredQuestions}/${activeSession.totalQuestions} câu đã trả lời`
                : weakestSkill
                    ? `Band hiện tại ${formatBand(weakestSkill.averageBand)}`
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
            note: recentActivities.length > 0 ? recentActivities[0].examTitle : 'Chưa có feedback để xem',
            action: 'Xem',
            done: recentActivities.length === 0,
            onClick: () => {
                if (recentActivities.length > 0) {
                    navigate(`/app/sessions/${recentActivities[0].sessionId}/submit`);
                }
            },
        },
        {
            title: 'Hoàn thành mục tiêu tuần',
            note: `${completedThisWeek}/${WEEKLY_GOAL} bài đã hoàn thành (${weeklyProgress}%)`,
            action: 'Luyện',
            done: completedThisWeek >= WEEKLY_GOAL,
            onClick: () => navigate('/app/practice'),
        },
    ];


    const summaryItems = [
        {
            label: 'Best Band',
            value: formatBand(bestBand),
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
                estimatedOverallBand={estimatedOverallBand}
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

                    {speakingDetailQueries.some((query) => query.isLoading) ? (
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

                                return (
                                    <button
                                        key={item.sessionId}
                                        type="button"
                                        className="recent-item"
                                        onClick={() => navigate(`/app/sessions/${item.sessionId}/submit`)}
                                    >
                                        <span className="recent-icon" style={{ color: tone.color, background: tone.tint }}>
                                            {tone.icon}
                                        </span>
                                        <span className="recent-copy">
                                            <strong>{item.examTitle}</strong>
                                            <small>{formatDateTimeToMinute(item.completedAt) || item.completedAt}</small>
                                        </span>
                                        <span className="recent-score">
                                            {item.bandScore != null ? item.bandScore.toFixed(1) : getSkillLabel(item.skillType)}
                                        </span>
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
