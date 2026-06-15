import React, { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import {
    Avatar,
    Button,
    Empty,
    Progress,
    Skeleton,
    Space,
    Tag,
    Typography,
} from 'antd';
import {
    BookOutlined,
    CheckCircleOutlined,
    FireOutlined,
    PlayCircleOutlined,
    ReadOutlined,
    RightOutlined,
    RocketOutlined,
    SoundOutlined,
    TrophyOutlined,
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
    CartesianGrid,
    Line,
    LineChart,
    PolarAngleAxis,
    PolarGrid,
    PolarRadiusAxis,
    Radar,
    RadarChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { useUserProfileQuery } from '@/features/admin/api/user.api';
import { formatDateTimeToMinute } from '@/shared/lib/dateTime';
import { sessionApi, sessionKeys, useMyPracticeSessionsQuery } from '../api/session.api';
import { getSessionRunnerPath, getSkillLabel } from '../lib/sessionRouting';
import { getStreakDisplayMeta } from '../lib/streakDisplay';
import type { PracticeSessionListItemDto } from '../types/session.types';

const { Title, Text, Paragraph } = Typography;

const WEEKLY_GOAL = 5;
const SKILLS = ['READING', 'LISTENING', 'WRITING', 'SPEAKING'] as const;

type SkillKey = (typeof SKILLS)[number];

const palette = {
    bg: '#F9FAFB',
    ink: '#111827',
    muted: '#6B7280',
    border: 'rgba(148, 163, 184, 0.22)',
    card: 'rgba(255, 255, 255, 0.76)',
    indigo: '#4F46E5',
    blue: '#2563EB',
    green: '#16A34A',
    orange: '#F97316',
    cyan: '#0891B2',
    amber: '#F59E0B',
    rose: '#E11D48',
};

const skillMeta: Record<SkillKey, {
    label: string;
    shortLabel: string;
    color: string;
    tint: string;
    icon: React.ReactNode;
}> = {
    READING: {
        label: 'Reading',
        shortLabel: 'Đọc',
        color: '#2563EB',
        tint: '#EFF6FF',
        icon: <ReadOutlined />,
    },
    LISTENING: {
        label: 'Listening',
        shortLabel: 'Nghe',
        color: '#7C3AED',
        tint: '#F5F3FF',
        icon: <SoundOutlined />,
    },
    WRITING: {
        label: 'Writing',
        shortLabel: 'Viết',
        color: '#D97706',
        tint: '#FFF7ED',
        icon: <BookOutlined />,
    },
    SPEAKING: {
        label: 'Speaking',
        shortLabel: 'Nói',
        color: '#16A34A',
        tint: '#F0FDF4',
        icon: <FireOutlined />,
    },
};

const cardMotion = {
    whileHover: { y: -4 },
    transition: { duration: 0.18 },
};

const fadeIn = (delay = 0) => ({
    initial: { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.34, delay },
});

const parseDateMs = (value?: string | null) => {
    if (!value) return 0;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : 0;
};

const getSkillKey = (value?: string | null): SkillKey => {
    const normalized = (value ?? '').trim().toUpperCase();
    return SKILLS.includes(normalized as SkillKey) ? normalized as SkillKey : 'READING';
};

const isFinishedSession = (session: PracticeSessionListItemDto) =>
    session.status === 'Completed' || session.status === 'Submitted';

const getSessionBandScore = (session: PracticeSessionListItemDto) =>
    session.totalBandScore
    ?? session.writingScore
    ?? session.speakingScore
    ?? null;

const formatBand = (value?: number | null) => (
    value != null ? value.toFixed(1) : '-'
);

const formatShortDate = (value?: string | null) => {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';

    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
};

const getFirstName = (displayName?: string | null) => {
    const trimmed = displayName?.trim();
    if (!trimmed) return 'bạn';

    return trimmed.split(/\s+/)[0];
};

const statusLabelMap: Record<string, string> = {
    NotStarted: 'Chưa bắt đầu',
    InProgress: 'Đang làm',
    Submitted: 'Đã nộp',
    Completed: 'Hoàn thành',
    Abandoned: 'Đã hủy',
};

const getSessionDurationMinutes = (session: PracticeSessionListItemDto) => {
    const startedAtMs = parseDateMs(session.startedAt);
    const endedAtMs = parseDateMs(session.endedAt);
    if (startedAtMs <= 0 || endedAtMs <= startedAtMs) return 0;

    return Math.max(1, Math.round((endedAtMs - startedAtMs) / 60000));
};

const formatMinutes = (minutes: number) => {
    if (minutes <= 0) return '0 phút';
    if (minutes < 60) return `${minutes} phút`;

    const hours = Math.floor(minutes / 60);
    const remain = minutes % 60;
    return remain > 0 ? `${hours} giờ ${remain} phút` : `${hours} giờ`;
};

export const ClientDashboard: React.FC = () => {
    const navigate = useNavigate();
    const { data: profile, isLoading: isProfileLoading } = useUserProfileQuery();
    const { data: sessions = [], isLoading: isSessionsLoading } = useMyPracticeSessionsQuery();

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

    const bandTrendData = useMemo(
        () => finishedSessions
            .map((session) => {
                const band = getSessionBandScore(session);
                const completedAtMs = parseDateMs(session.endedAt);
                if (band == null || completedAtMs <= 0) return null;

                const skill = getSkillKey(session.skillType);
                return {
                    label: formatShortDate(session.endedAt),
                    attemptLabel: formatShortDate(session.endedAt),
                    band: Number(band.toFixed(1)),
                    skill: skillMeta[skill].label,
                    examTitle: session.examTitle,
                    completedAt: session.endedAt ?? session.startedAt,
                };
            })
            .filter((item): item is {
                label: string;
                attemptLabel: string;
                band: number;
                skill: string;
                examTitle: string;
                completedAt: string;
            } => item != null)
            .sort((left, right) => parseDateMs(left.completedAt) - parseDateMs(right.completedAt))
            .slice(-8)
            .map((item, index) => ({
                ...item,
                label: `${index + 1}`,
            })),
        [finishedSessions],
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
    const currentLevel = profile?.gamification.currentLevel ?? 1;
    const currentXp = profile?.gamification.experiencePoints ?? 0;
    const levelProgress = profile?.gamification.levelProgressPercent ?? 0;
    const xpToNextLevel = profile?.gamification.experienceToNextLevel ?? 0;
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
            note: `${completedThisWeek}/${WEEKLY_GOAL} bài đã hoàn thành`,
            action: 'Luyện',
            done: completedThisWeek >= WEEKLY_GOAL,
            onClick: () => navigate('/app/practice'),
        },
    ];

    const leaderboardRows = [
        {
            rank: 1,
            name: profile?.displayName || 'Bạn',
            value: `${currentXp} XP`,
            badge: 'Bạn',
            active: true,
        },
        {
            rank: 2,
            name: 'Đang cập nhật',
            value: 'Tuần này',
            badge: 'Lớp',
            active: false,
        },
        {
            rank: 3,
            name: 'Đang cập nhật',
            value: 'Tuần này',
            badge: 'Lớp',
            active: false,
        },
    ];

    const summaryItems = [
        {
            label: 'Best Band',
            value: formatBand(bestBand),
            detail: `${uniqueExamCount} đề tính XP`,
            icon: <TrophyOutlined />,
            color: palette.green,
        },
        {
            label: 'Level',
            value: `Lv.${currentLevel}`,
            detail: `${xpToNextLevel} XP để lên cấp`,
            icon: <RocketOutlined />,
            color: palette.blue,
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

            <motion.section className="dashboard-hero glass-card" {...fadeIn(0)}>
                <div className="hero-main">
                    <div className="hero-copy">
                        <Space size={12} align="center" wrap>
                            <Avatar size={48} src={profile?.avatarUrl} className="hero-avatar">
                                {profile?.displayName?.charAt(0)?.toUpperCase() || 'U'}
                            </Avatar>
                            <div>
                                <Text className="eyebrow">Welcome back, {firstName}</Text>
                                <Title level={2} className="hero-title">
                                    Giữ nhịp luyện IELTS hôm nay
                                </Title>
                            </div>
                        </Space>

                        <div className="hero-tags">
                            <Tag
                                className="streak-pill"
                                style={{
                                    color: streakMeta.accent,
                                    borderColor: streakMeta.borderColor,
                                    background: streakMeta.background,
                                }}
                            >
                                <span
                                    className="streak-pill-icon"
                                    style={{
                                        background: streakMeta.iconBackground,
                                        color: streakMeta.iconColor,
                                    }}
                                >
                                    {streakMeta.icon}
                                </span>
                                {streakMeta.shortTitle}
                            </Tag>
                            <Tag className="soft-pill">Kỷ lục {longestStreak} ngày</Tag>
                            <Tag className="soft-pill">{currentXp} XP</Tag>
                        </div>

                        <Paragraph className="hero-desc">
                            Dashboard tập trung vào điểm hiện tại, kỹ năng yếu nhất và nhiệm vụ nên làm tiếp theo.
                        </Paragraph>
                    </div>

                    <div className="hero-action">
                        <Text className="eyebrow">Today's Focus</Text>
                        <Title level={4} className="focus-title">
                            {activeSession
                                ? activeSession.examTitle
                                : weakestSkill
                                    ? `Luyện ${weakestSkill.label}`
                                    : 'Bắt đầu bài luyện đầu tiên'}
                        </Title>
                        <Text className="focus-note">
                            {activeSession
                                ? `${activeSession.answeredQuestions}/${activeSession.totalQuestions} câu - ${statusLabelMap[activeSession.status] ?? activeSession.status}`
                                : weakestSkill
                                    ? `Band trung bình ${formatBand(weakestSkill.averageBand)}`
                                    : 'Hoàn thành 1 task để mở streak và XP.'}
                        </Text>
                        <Button
                            type="primary"
                            size="large"
                            icon={activeSession ? <PlayCircleOutlined /> : <RocketOutlined />}
                            onClick={() => {
                                if (activeSession) {
                                    navigate(getSessionRunnerPath(activeSession.sessionId, activeSession.skillType));
                                    return;
                                }

                                navigate(`/app/practice${weakestSkill ? `?skill=${weakestSkill.skill}` : ''}`);
                            }}
                        >
                            {activeSession ? 'Tiếp tục bài' : 'Luyện ngay'}
                        </Button>
                    </div>
                </div>

                <div className="band-panel">
                    <Text className="eyebrow">Estimated Overall Band</Text>
                    <div className="band-number">{formatBand(estimatedOverallBand)}</div>
                    <Progress
                        percent={estimatedOverallBand != null ? Math.round((estimatedOverallBand / 9) * 100) : 0}
                        showInfo={false}
                        strokeColor={palette.indigo}
                        trailColor="rgba(79, 70, 229, 0.12)"
                    />
                    <div className="band-footer">
                        <span>Lv.{currentLevel}</span>
                        <span>{levelProgress}% level progress</span>
                    </div>
                </div>
            </motion.section>

            <section className="summary-strip">
                {summaryItems.map((item, index) => (
                    <motion.div
                        key={item.label}
                        className="summary-card glass-card"
                        {...fadeIn(0.04 + index * 0.03)}
                        {...cardMotion}
                    >
                        <div className="summary-icon" style={{ color: item.color, background: `${item.color}12` }}>
                            {item.icon}
                        </div>
                        <div>
                            <Text className="summary-label">{item.label}</Text>
                            <div className="summary-value">{item.value}</div>
                            <Text className="summary-detail">{item.detail}</Text>
                        </div>
                    </motion.div>
                ))}
            </section>

            <section className="bento-grid">
                <motion.div className="bento-card bento-radar glass-card" {...fadeIn(0.1)} {...cardMotion}>
                    <div className="card-head">
                        <div>
                            <Text className="eyebrow">Skill Balance</Text>
                            <Title level={3} className="card-title">Radar 4 kỹ năng</Title>
                        </div>
                        <Tag className="soft-pill">Band / 9.0</Tag>
                    </div>

                    {scoredBands.length === 0 ? (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa đủ dữ liệu kỹ năng." />
                    ) : (
                        <div className="radar-wrap">
                            <ResponsiveContainer width="100%" height={360}>
                                <RadarChart data={radarData} outerRadius="72%">
                                    <PolarGrid stroke="rgba(100, 116, 139, 0.22)" />
                                    <PolarAngleAxis dataKey="skill" tick={{ fill: palette.ink, fontSize: 13, fontWeight: 700 }} />
                                    <PolarRadiusAxis domain={[0, 9]} tickCount={5} tick={{ fill: palette.muted, fontSize: 11 }} />
                                    <Radar
                                        name="Band"
                                        dataKey="band"
                                        stroke={palette.indigo}
                                        fill={palette.indigo}
                                        fillOpacity={0.2}
                                        strokeWidth={3}
                                        isAnimationActive
                                        animationDuration={900}
                                    />
                                    <Tooltip />
                                </RadarChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    <div className="skill-mini-grid">
                        {skillRows.map((skill) => (
                            <div key={skill.skill} className="skill-mini">
                                <span className="skill-dot" style={{ background: skill.color }} />
                                <span>{skill.label}</span>
                                <strong>{formatBand(skill.averageBand)}</strong>
                            </div>
                        ))}
                    </div>
                </motion.div>

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

                <motion.div className="bento-card bento-leaderboard glass-card" {...fadeIn(0.3)} {...cardMotion}>
                    <div className="card-head compact">
                        <div>
                            <Text className="eyebrow">Leaderboard</Text>
                            <Title level={4} className="card-title">Top tuần</Title>
                        </div>
                        <TrophyOutlined className="leader-icon" />
                    </div>

                    <div className="leader-list">
                        {leaderboardRows.map((row) => (
                            <div key={`${row.rank}-${row.name}`} className={row.active ? 'leader-row active' : 'leader-row'}>
                                <span className="leader-rank">#{row.rank}</span>
                                <span className="leader-name">
                                    <strong>{row.name}</strong>
                                    <small>{row.badge}</small>
                                </span>
                                <span className="leader-value">{row.value}</span>
                            </div>
                        ))}
                    </div>
                </motion.div>
            </section>
        </div>
    );
};

const dashboardStyles = `
.dashboard-shell {
    min-height: 100%;
    max-width: 1220px;
    margin: 0 auto;
    padding: 6px 0 28px;
    color: ${palette.ink};
    font-family: "Plus Jakarta Sans", "Inter", "Outfit", sans-serif;
}

.dashboard-shell::before {
    content: "";
    position: fixed;
    inset: 0;
    z-index: -1;
    background:
        linear-gradient(135deg, rgba(79, 70, 229, 0.08), transparent 34%),
        linear-gradient(315deg, rgba(22, 163, 74, 0.08), transparent 30%),
        ${palette.bg};
}

.glass-card {
    border: 1px solid ${palette.border};
    background: ${palette.card};
    box-shadow: 0 18px 45px rgba(15, 23, 42, 0.08);
    backdrop-filter: blur(18px);
}

.dashboard-hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 260px;
    gap: 18px;
    border-radius: 28px;
    padding: 22px;
    margin-bottom: 16px;
}

.hero-main {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(260px, 360px);
    gap: 18px;
}

.hero-copy,
.hero-action,
.band-panel {
    border-radius: 22px;
    background: rgba(255, 255, 255, 0.68);
    border: 1px solid rgba(226, 232, 240, 0.72);
    padding: 18px;
}

.hero-copy {
    min-height: 230px;
}

.hero-avatar {
    box-shadow: 0 12px 28px rgba(37, 99, 235, 0.22);
}

.eyebrow {
    color: ${palette.muted};
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0;
    text-transform: uppercase;
}

.hero-title,
.card-title,
.focus-title {
    color: ${palette.ink} !important;
    margin: 0 !important;
    font-weight: 850 !important;
    letter-spacing: 0;
}

.hero-title {
    font-size: 30px !important;
    line-height: 1.12 !important;
}

.hero-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 18px 0 12px;
}

.streak-pill,
.soft-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: 999px;
    padding: 5px 10px;
    margin: 0;
    font-weight: 750;
}

.streak-pill {
    color: #9a3412;
    border-color: rgba(249, 115, 22, 0.22);
    background: rgba(255, 237, 213, 0.82);
}

.streak-pill-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 999px;
    font-size: 11px;
    line-height: 1;
}

.soft-pill {
    color: ${palette.ink};
    border-color: rgba(148, 163, 184, 0.22);
    background: rgba(255, 255, 255, 0.72);
}

.hero-desc,
.focus-note {
    color: ${palette.muted};
    margin: 0;
}

.hero-action {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 16px;
}

.focus-title {
    font-size: 20px !important;
    line-height: 1.25 !important;
}

.band-panel {
    display: flex;
    flex-direction: column;
    justify-content: center;
}

.band-number {
    font-size: 76px;
    line-height: 1;
    font-weight: 900;
    color: ${palette.indigo};
    margin: 12px 0 16px;
}

.band-footer {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    color: ${palette.muted};
    font-size: 13px;
    margin-top: 8px;
}

.summary-strip {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    margin-bottom: 16px;
}

.summary-card {
    display: flex;
    gap: 14px;
    align-items: center;
    border-radius: 22px;
    padding: 16px;
}

.summary-icon {
    width: 46px;
    height: 46px;
    display: grid;
    place-items: center;
    border-radius: 16px;
    font-size: 20px;
    flex: 0 0 46px;
}

.summary-label,
.summary-detail {
    color: ${palette.muted};
    font-size: 13px;
}

.summary-value {
    color: ${palette.ink};
    font-size: 24px;
    font-weight: 900;
    line-height: 1.1;
}

.bento-grid {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 16px;
}

.bento-card {
    border-radius: 28px;
    padding: 18px;
    min-height: 230px;
    overflow: hidden;
}

.bento-radar {
    grid-column: span 7;
    grid-row: span 2;
    min-height: 560px;
}

.bento-planner,
.bento-fluency {
    grid-column: span 5;
}

.bento-vocab {
    grid-column: span 3;
}

.bento-recent {
    grid-column: span 6;
}

.bento-leaderboard {
    grid-column: span 3;
}

.card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
    margin-bottom: 14px;
}

.card-head.compact {
    margin-bottom: 12px;
}

.radar-wrap {
    min-height: 370px;
}

.skill-mini-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
}

.skill-mini {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 8px;
    align-items: center;
    padding: 10px 12px;
    border-radius: 16px;
    background: rgba(248, 250, 252, 0.82);
    color: ${palette.ink};
    font-size: 13px;
}

.skill-dot {
    width: 9px;
    height: 9px;
    border-radius: 999px;
}

.planner-list,
.recent-list,
.leader-list {
    display: grid;
    gap: 10px;
}

.planner-item,
.recent-item {
    width: 100%;
    border: 1px solid rgba(226, 232, 240, 0.85);
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.68);
    color: ${palette.ink};
    cursor: pointer;
    text-align: left;
    transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
}

.planner-item:hover,
.recent-item:hover {
    transform: translateY(-2px);
    border-color: rgba(79, 70, 229, 0.3);
    background: rgba(255, 255, 255, 0.9);
}

.planner-item {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 12px;
    align-items: center;
    padding: 12px;
}

.planner-index {
    width: 30px;
    height: 30px;
    border-radius: 12px;
    display: grid;
    place-items: center;
    background: rgba(79, 70, 229, 0.1);
    color: ${palette.indigo};
    font-weight: 900;
}

.planner-index.done {
    background: rgba(22, 163, 74, 0.1);
    color: ${palette.green};
}

.planner-copy,
.recent-copy,
.leader-name {
    min-width: 0;
}

.planner-copy strong,
.recent-copy strong,
.leader-name strong {
    display: block;
    color: ${palette.ink};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.planner-copy small,
.recent-copy small,
.leader-name small {
    display: block;
    color: ${palette.muted};
    font-size: 12px;
    margin-top: 2px;
}

.planner-action {
    color: ${palette.indigo};
    font-size: 12px;
    font-weight: 850;
}

.flashcard-box {
    margin-top: 16px;
    border-radius: 24px;
    padding: 18px;
    background: linear-gradient(135deg, rgba(79, 70, 229, 0.1), rgba(8, 145, 178, 0.1));
    border: 1px solid rgba(79, 70, 229, 0.16);
}

.flashcard-label {
    color: ${palette.muted};
    font-size: 12px;
    font-weight: 800;
}

.flashcard-word {
    color: ${palette.ink};
    font-size: 28px;
    font-weight: 900;
    margin: 6px 0;
}

.flashcard-note {
    color: ${palette.muted};
    font-size: 13px;
}

.recent-item {
    display: grid;
    grid-template-columns: auto 1fr auto auto;
    gap: 10px;
    align-items: center;
    padding: 12px;
}

.recent-icon {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border-radius: 14px;
    font-size: 16px;
}

.recent-score {
    color: ${palette.ink};
    font-size: 16px;
    font-weight: 900;
}

.recent-arrow {
    color: #94a3b8;
    font-size: 12px;
}

.leader-icon {
    color: ${palette.amber};
    font-size: 24px;
}

.leader-row {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 10px;
    align-items: center;
    padding: 12px;
    border-radius: 18px;
    background: rgba(248, 250, 252, 0.78);
    border: 1px solid rgba(226, 232, 240, 0.86);
}

.leader-row.active {
    background: rgba(79, 70, 229, 0.08);
    border-color: rgba(79, 70, 229, 0.2);
}

.leader-rank {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border-radius: 12px;
    background: #fff;
    color: ${palette.indigo};
    font-weight: 900;
}

.leader-value {
    color: ${palette.ink};
    font-size: 12px;
    font-weight: 850;
}

.dashboard-skeleton {
    border-radius: 28px;
    padding: 22px;
    border: 1px solid ${palette.border};
    background: ${palette.card};
}

.skeleton-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    margin-top: 18px;
}

.skeleton-node {
    width: 100% !important;
    height: 180px !important;
    border-radius: 22px !important;
}

@media (max-width: 1100px) {
    .dashboard-hero,
    .hero-main {
        grid-template-columns: 1fr;
    }

    .summary-strip {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .bento-radar,
    .bento-planner,
    .bento-fluency,
    .bento-vocab,
    .bento-recent,
    .bento-leaderboard {
        grid-column: span 6;
    }
}

@media (max-width: 760px) {
    .dashboard-shell {
        padding-bottom: 20px;
    }

    .dashboard-hero {
        padding: 14px;
        border-radius: 22px;
    }

    .hero-copy,
    .hero-action,
    .band-panel,
    .bento-card {
        border-radius: 20px;
        padding: 14px;
    }

    .hero-title {
        font-size: 24px !important;
    }

    .band-number {
        font-size: 56px;
    }

    .summary-strip,
    .skill-mini-grid,
    .skeleton-grid {
        grid-template-columns: 1fr;
    }

    .bento-radar,
    .bento-planner,
    .bento-fluency,
    .bento-vocab,
    .bento-recent,
    .bento-leaderboard {
        grid-column: span 12;
        min-height: auto;
    }
}
`;
