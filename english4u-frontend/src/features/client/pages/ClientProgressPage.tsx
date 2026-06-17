import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Table,
    Select,
    Progress,
    Row,
    Col,
    Typography,
    Space,
    Tag,
    Empty,
    Button,
    Skeleton,
} from 'antd';
import {
    TrophyOutlined,
    ClockCircleOutlined,
    BookOutlined,
    FireOutlined,
    ThunderboltOutlined,
    SafetyCertificateOutlined,
    StarOutlined,
    RightOutlined,
    ReadOutlined,
    SoundOutlined,
    CheckCircleOutlined,
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';
import { useUserProfileQuery } from '@/features/admin/api/user.api';
import { useMyPracticeSessionsQuery } from '../api/session.api';
import { getSkillLabel } from '../lib/sessionRouting';
import { formatDateTimeToMinute } from '@/shared/lib/dateTime';
import type { PracticeSessionListItemDto } from '../types/session.types';

const { Title, Text, Paragraph } = Typography;

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
    purple: '#7C3AED',
    rose: '#E11D48',
};

const skillMeta = {
    READING: {
        label: 'Reading',
        color: '#2563EB',
        tint: '#EFF6FF',
        icon: <ReadOutlined />,
    },
    LISTENING: {
        label: 'Listening',
        color: '#7C3AED',
        tint: '#F5F3FF',
        icon: <SoundOutlined />,
    },
    WRITING: {
        label: 'Writing',
        color: '#D97706',
        tint: '#FFF7ED',
        icon: <BookOutlined />,
    },
    SPEAKING: {
        label: 'Speaking',
        color: '#16A34A',
        tint: '#F0FDF4',
        icon: <FireOutlined />,
    },
};

type SkillKey = keyof typeof skillMeta;

const getSkillKey = (value?: string | null): SkillKey => {
    const normalized = (value ?? '').trim().toUpperCase();
    return normalized in skillMeta ? (normalized as SkillKey) : 'READING';
};

const isFinished = (session: PracticeSessionListItemDto) =>
    session.status === 'Completed' || session.status === 'Submitted';

const getSessionScore = (session: PracticeSessionListItemDto) =>
    session.totalBandScore ?? session.writingScore ?? session.speakingScore ?? null;

const parseDateMs = (value?: string | null) => {
    if (!value) return 0;
    const ts = Date.parse(value);
    return Number.isFinite(ts) ? ts : 0;
};

const getDurationMinutes = (session: PracticeSessionListItemDto) => {
    const start = parseDateMs(session.startedAt);
    const end = parseDateMs(session.endedAt);
    if (start <= 0 || end <= start) return 0;
    return Math.max(1, Math.round((end - start) / 60000));
};

const formatShortDate = (value?: string | null) => {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
};

const getAiAdvice = (skill: string, avgBand: number | null) => {
    if (avgBand === null) return 'Hãy hoàn thành bài thi thử đầu tiên để nhận đánh giá chi tiết từ trợ lý học tập.';
    
    if (avgBand < 5.0) {
        return 'Tập trung học từ vựng học thuật cơ bản và luyện tập các chủ đề quen thuộc hàng ngày.';
    }
    if (avgBand < 6.0) {
        if (skill === 'READING' || skill === 'LISTENING') return 'Luyện tập phương pháp Skimming và Scanning để tăng tốc độ tìm ý chính.';
        return 'Học cách mở rộng câu phức và cấu trúc ngữ pháp mạch lạc cho bài nói/viết.';
    }
    if (avgBand < 7.0) {
        if (skill === 'READING' || skill === 'LISTENING') return 'Tập trung luyện các câu hỏi khó như Headings và Multiple Choice.';
        return 'Tập trung nâng cấp từ vựng chuyên sâu (collocations) và phân bổ lập luận chặt chẽ.';
    }
    return 'Duy trì phong độ làm đề nâng cao, tối ưu hóa các lỗi diễn đạt nhỏ để hướng tới band điểm tối đa.';
};

export const ClientProgressPage: React.FC = () => {
    const navigate = useNavigate();
    const { data: profile, isLoading: isProfileLoading } = useUserProfileQuery();
    const { data: sessions = [], isLoading: isSessionsLoading } = useMyPracticeSessionsQuery();

    const [chartSkill, setChartSkill] = useState<string>('ALL');
    const [historySkill, setHistorySkill] = useState<string>('ALL');

    const finishedSessions = useMemo(() => sessions.filter(isFinished), [sessions]);

    const stats = useMemo(() => {
        const totalMinutes = finishedSessions.reduce((sum, s) => sum + getDurationMinutes(s), 0);
        const scores = finishedSessions.map(getSessionScore).filter((s): s is number => s !== null);
        const bestBand = scores.length > 0 ? Math.max(...scores) : null;
        const averageBand = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

        const skillsDone = new Set(finishedSessions.map(s => getSkillKey(s.skillType)));

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
        const filtered = finishedSessions.filter(s => chartSkill === 'ALL' || getSkillKey(s.skillType) === chartSkill);
        return filtered
            .map(s => ({
                date: formatShortDate(s.endedAt),
                band: getSessionScore(s) ?? 0,
                title: s.examTitle,
                completedAt: s.endedAt ?? s.startedAt,
            }))
            .sort((a, b) => parseDateMs(a.completedAt) - parseDateMs(b.completedAt))
            .slice(-10);
    }, [finishedSessions, chartSkill]);

    const badges = useMemo(() => {
        const longestStreak = profile?.gamification.longestStreakCount ?? 0;
        return [
            {
                id: 'first_exam',
                title: 'Khởi đầu vững chắc',
                desc: 'Hoàn thành 1 bài luyện thi',
                icon: <TrophyOutlined />,
                unlocked: stats.completedCount >= 1,
                color: '#EAB308',
            },
            {
                id: 'time_scholar',
                title: 'Học giả kiên trì',
                desc: 'Tích lũy 120 phút học tập',
                icon: <ClockCircleOutlined />,
                unlocked: stats.totalMinutes >= 120,
                color: '#3B82F6',
            },
            {
                id: 'streak_discipline',
                title: 'Kỷ luật thép',
                desc: 'Đạt kỷ lục streak 3 ngày',
                icon: <FireOutlined />,
                unlocked: longestStreak >= 3,
                color: '#EF4444',
            },
            {
                id: 'all_rounder',
                title: 'Chiến binh toàn năng',
                desc: 'Luyện tập đủ 4 kỹ năng',
                icon: <SafetyCertificateOutlined />,
                unlocked: stats.allSkillsAttempted,
                color: '#10B981',
            },
            {
                id: 'top_score',
                title: 'Chinh phục đỉnh cao',
                desc: 'Đạt band score từ 7.0+',
                icon: <StarOutlined />,
                unlocked: stats.bestBand !== null && stats.bestBand >= 7.0,
                color: '#A855F7',
            },
        ];
    }, [stats, profile]);

    const skillAnalytics = useMemo(() => {
        return (['READING', 'LISTENING', 'WRITING', 'SPEAKING'] as const).map(key => {
            const skillSessions = finishedSessions.filter(s => getSkillKey(s.skillType) === key);
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
            .filter(s => historySkill === 'ALL' || getSkillKey(s.skillType) === historySkill)
            .map(s => ({
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

            <motion.section 
                className="progress-header"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
            >
                <Title level={2} className="header-title">Tiến trình & Phân tích Học tập</Title>
                <Paragraph className="header-desc">
                    Trang theo dõi chi tiết lịch sử làm bài, phân tích năng lực cá nhân và đánh giá gợi ý học tập từ AI.
                </Paragraph>
            </motion.section>

            <Row gutter={[20, 20]} className="stats-row">
                <Col xs={24} sm={12} md={6}>
                    <motion.div className="stat-card glass-card" whileHover={{ y: -3 }}>
                        <div className="stat-icon" style={{ color: palette.indigo, background: `${palette.indigo}12` }}>
                            <TrophyOutlined />
                        </div>
                        <div>
                            <Text className="stat-label">Band Score Cao Nhất</Text>
                            <div className="stat-value">{stats.bestBand !== null ? stats.bestBand.toFixed(1) : '-'}</div>
                            <Text className="stat-sub">Mục tiêu band score 9.0</Text>
                        </div>
                    </motion.div>
                </Col>
                <Col xs={24} sm={12} md={6}>
                    <motion.div className="stat-card glass-card" whileHover={{ y: -3 }}>
                        <div className="stat-icon" style={{ color: palette.blue, background: `${palette.blue}12` }}>
                            <ClockCircleOutlined />
                        </div>
                        <div>
                            <Text className="stat-label">Thời Gian Tích Lũy</Text>
                            <div className="stat-value">
                                {stats.totalMinutes < 60 ? `${stats.totalMinutes} phút` : `${Math.floor(stats.totalMinutes / 60)} giờ`}
                            </div>
                            <Text className="stat-sub">{stats.completedCount} bài đã hoàn thành</Text>
                        </div>
                    </motion.div>
                </Col>
                <Col xs={24} sm={12} md={6}>
                    <motion.div className="stat-card glass-card" whileHover={{ y: -3 }}>
                        <div className="stat-icon" style={{ color: palette.green, background: `${palette.green}12` }}>
                            <CheckCircleOutlined />
                        </div>
                        <div>
                            <Text className="stat-label">Số Kỹ Năng Đã Luyện</Text>
                            <div className="stat-value">{stats.skillsDoneCount}/4</div>
                            <Text className="stat-sub">Đã trải nghiệm {stats.skillsDoneCount} kỹ năng</Text>
                        </div>
                    </motion.div>
                </Col>
                <Col xs={24} sm={12} md={6}>
                    <motion.div className="stat-card glass-card" whileHover={{ y: -3 }}>
                        <div className="stat-icon" style={{ color: palette.orange, background: `${palette.orange}12` }}>
                            <FireOutlined />
                        </div>
                        <div>
                            <Text className="stat-label">Daily Streak</Text>
                            <div className="stat-value">{profile?.gamification.dailyStreakCount ?? 0} ngày</div>
                            <Text className="stat-sub">Kỷ lục cũ: {profile?.gamification.longestStreakCount ?? 0} ngày</Text>
                        </div>
                    </motion.div>
                </Col>
            </Row>

            <motion.section 
                className="section-panel glass-card"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.1 }}
            >
                <div className="panel-head">
                    <div>
                        <Text className="eyebrow">Performance Chart</Text>
                        <Title level={4} className="panel-title">Xu Hướng Luyện Tập</Title>
                    </div>
                    <Select
                        value={chartSkill}
                        onChange={setChartSkill}
                        style={{ width: 160 }}
                        options={[
                            { value: 'ALL', label: 'Tất cả kỹ năng' },
                            { value: 'READING', label: 'Reading' },
                            { value: 'LISTENING', label: 'Listening' },
                            { value: 'WRITING', label: 'Writing' },
                            { value: 'SPEAKING', label: 'Speaking' },
                        ]}
                    />
                </div>

                {chartData.length === 0 ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có dữ liệu điểm số cho kỹ năng này." />
                ) : (
                    <div className="chart-wrap">
                        <ResponsiveContainer width="100%" height={280}>
                            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={activeChartColor} stopOpacity={0.2} />
                                        <stop offset="95%" stopColor={activeChartColor} stopOpacity={0.0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" />
                                <XAxis dataKey="date" tick={{ fill: palette.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                                <YAxis domain={[0, 9]} tickCount={10} tick={{ fill: palette.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                                <Tooltip 
                                    contentStyle={{ background: '#fff', border: `1px solid ${palette.border}`, borderRadius: 12, boxShadow: '0 10px 25px rgba(0,0,0,0.05)' }}
                                    formatter={(value: any, name: any, props: any) => [`Band ${Number(value).toFixed(1)}`, props.payload.title]}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="band"
                                    stroke={activeChartColor}
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#chartGradient)"
                                    dot={{ r: 4, stroke: activeChartColor, strokeWidth: 2, fill: '#fff' }}
                                    activeDot={{ r: 6 }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </motion.section>

            <motion.section 
                className="section-panel flex-panel"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.15 }}
            >
                <div className="section-title-wrap">
                    <Text className="eyebrow">Skill breakdown</Text>
                    <Title level={3} className="section-main-title">Đánh Giá & Lời Khuyên Theo Kỹ Năng</Title>
                </div>
                <Row gutter={[20, 20]}>
                    {skillAnalytics.map(skill => (
                        <Col xs={24} md={12} key={skill.key}>
                            <div className="skill-analysis-card glass-card">
                                <div className="card-top">
                                    <div className="skill-icon-wrap" style={{ color: skill.color, background: skill.tint }}>
                                        {skill.icon}
                                    </div>
                                    <div className="skill-info">
                                        <Title level={4} className="skill-name">{skill.label}</Title>
                                        <Text className="skill-attempts">{skill.attempts} lần thử</Text>
                                    </div>
                                    <div className="skill-scores">
                                        <div className="score-item">
                                            <span className="score-val">{skill.avgScore !== null ? skill.avgScore.toFixed(1) : '-'}</span>
                                            <span className="score-lbl">TB Band</span>
                                        </div>
                                        <div className="score-divider" />
                                        <div className="score-item">
                                            <span className="score-val">{skill.bestScore !== null ? skill.bestScore.toFixed(1) : '-'}</span>
                                            <span className="score-lbl">Tốt nhất</span>
                                        </div>
                                    </div>
                                </div>
                                
                                {skill.extraMetric && (
                                    <div className="skill-extra-metric">
                                        <Tag color="geekblue" className="metric-tag">{skill.extraMetric}</Tag>
                                    </div>
                                )}

                                <div className="advice-box">
                                    <div className="advice-header">Trợ lý AI khuyên học:</div>
                                    <div className="advice-text">{skill.advice}</div>
                                </div>
                            </div>
                        </Col>
                    ))}
                </Row>
            </motion.section>

            <motion.section 
                className="section-panel flex-panel"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.2 }}
            >
                <div className="section-title-wrap">
                    <Text className="eyebrow">Achievements</Text>
                    <Title level={3} className="section-main-title">Huy Hiệu Đạt Được</Title>
                </div>
                <Row gutter={[16, 16]}>
                    {badges.map(badge => (
                        <Col xs={12} sm={8} md={4} key={badge.id} style={{ flexGrow: 1, maxWidth: '20%' }}>
                            <div className={badge.unlocked ? 'badge-card unlocked glass-card' : 'badge-card locked glass-card'}>
                                <div 
                                    className="badge-icon" 
                                    style={{ 
                                        color: badge.unlocked ? badge.color : '#94A3B8',
                                        background: badge.unlocked ? `${badge.color}15` : '#F1F5F9'
                                    }}
                                >
                                    {badge.icon}
                                </div>
                                <div className="badge-title">{badge.title}</div>
                                <div className="badge-desc">{badge.desc}</div>
                            </div>
                        </Col>
                    ))}
                </Row>
            </motion.section>

            <motion.section 
                className="section-panel glass-card"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.25 }}
            >
                <div className="panel-head">
                    <div>
                        <Text className="eyebrow">Practice History</Text>
                        <Title level={4} className="panel-title">Chi Tiết Các Lượt Làm Bài</Title>
                    </div>
                    <Select
                        value={historySkill}
                        onChange={setHistorySkill}
                        style={{ width: 160 }}
                        options={[
                            { value: 'ALL', label: 'Tất cả kỹ năng' },
                            { value: 'READING', label: 'Reading' },
                            { value: 'LISTENING', label: 'Listening' },
                            { value: 'WRITING', label: 'Writing' },
                            { value: 'SPEAKING', label: 'Speaking' },
                        ]}
                    />
                </div>

                <Table
                    dataSource={tableData}
                    pagination={{ pageSize: 6, showSizeChanger: false }}
                    className="custom-table"
                    locale={{ emptyText: <Empty description="Chưa có dữ liệu làm bài thi." image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                    columns={[
                        {
                            title: 'Tên đề thi',
                            dataIndex: 'title',
                            key: 'title',
                            className: 'table-col-title',
                            render: (text) => <span className="font-semibold text-slate-800">{text}</span>
                        },
                        {
                            title: 'Kỹ năng',
                            dataIndex: 'skill',
                            key: 'skill',
                            render: (skill: string) => {
                                const meta = skillMeta[skill as SkillKey];
                                return (
                                    <Tag color={skill === 'READING' ? 'blue' : skill === 'LISTENING' ? 'purple' : skill === 'WRITING' ? 'orange' : 'green'}>
                                        {meta?.label ?? skill}
                                    </Tag>
                                );
                            }
                        },
                        {
                            title: 'Điểm số',
                            dataIndex: 'score',
                            key: 'score',
                            render: (val: number | null) => (
                                <span className="font-bold text-slate-900">{val !== null ? val.toFixed(1) : '-'}</span>
                            )
                        },
                        {
                            title: 'Thời gian',
                            dataIndex: 'duration',
                            key: 'duration',
                            render: (mins: number) => <span className="text-slate-500">{mins} phút</span>
                        },
                        {
                            title: 'Ngày hoàn thành',
                            dataIndex: 'completedAt',
                            key: 'completedAt',
                            render: (val: string) => <span className="text-slate-400">{formatDateTimeToMinute(val)}</span>
                        },
                        {
                            title: 'Hành động',
                            key: 'actions',
                            align: 'center',
                            render: (_, record) => (
                                <Button
                                    type="text"
                                    icon={<RightOutlined />}
                                    className="table-action-btn"
                                    onClick={() => navigate(`/app/sessions/${record.key}/submit`)}
                                />
                            )
                        }
                    ]}
                />
            </motion.section>
        </div>
    );
};

const progressStyles = `
.progress-shell {
    max-width: 1220px;
    margin: 0 auto;
    padding: 6px 0 28px;
    font-family: "Plus Jakarta Sans", "Inter", "Outfit", sans-serif;
    color: ${palette.ink};
}

.progress-skeleton {
    padding: 24px;
}

.skeleton-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
    margin-top: 24px;
}

.progress-header {
    margin-bottom: 24px;
}

.header-title {
    font-weight: 800 !important;
    letter-spacing: -0.025em;
    margin-bottom: 6px !important;
}

.header-desc {
    color: ${palette.muted};
    font-size: 0.95rem;
    margin: 0 !important;
}

.stats-row {
    margin-bottom: 24px;
}

.glass-card {
    border: 1px solid ${palette.border} !important;
    background: ${palette.card} !important;
    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.04) !important;
    backdrop-filter: blur(16px);
    border-radius: 16px;
    padding: 20px;
}

.stat-card {
    display: flex;
    align-items: center;
    gap: 16px;
    height: 100%;
}

.stat-icon {
    width: 46px;
    height: 46px;
    border-radius: 12px;
    display: grid;
    place-items: center;
    font-size: 1.25rem;
    flex-shrink: 0;
}

.stat-label {
    display: block;
    font-size: 0.78rem;
    color: ${palette.muted};
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.stat-value {
    font-size: 1.5rem;
    font-weight: 800;
    color: ${palette.ink};
    line-height: 1.2;
    margin: 2px 0;
}

.stat-sub {
    display: block;
    font-size: 0.75rem;
    color: ${palette.muted};
}

.section-panel {
    margin-bottom: 28px;
}

.flex-panel {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.section-title-wrap {
    margin-bottom: 4px;
}

.eyebrow {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: ${palette.indigo};
    display: block;
    margin-bottom: 2px;
}

.section-main-title {
    font-weight: 800 !important;
    letter-spacing: -0.02em;
    margin: 0 !important;
    font-size: 1.35rem !important;
}

.panel-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    flex-wrap: wrap;
    gap: 12px;
}

.panel-title {
    font-weight: 750 !important;
    margin: 0 !important;
    font-size: 1.15rem !important;
}

.chart-wrap {
    margin-top: 10px;
    padding-top: 8px;
}

.skill-analysis-card {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 20px;
    border-radius: 16px;
    border: 1px solid ${palette.border};
}

.card-top {
    display: flex;
    align-items: center;
    gap: 16px;
}

.skill-icon-wrap {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: grid;
    place-items: center;
    font-size: 1.15rem;
    flex-shrink: 0;
}

.skill-info {
    flex: 1;
    min-width: 0;
}

.skill-name {
    font-weight: 700 !important;
    margin: 0 !important;
    font-size: 1.05rem !important;
}

.skill-attempts {
    font-size: 0.78rem;
    color: ${palette.muted};
}

.skill-scores {
    display: flex;
    align-items: center;
    gap: 12px;
}

.score-item {
    display: flex;
    flex-direction: column;
    align-items: center;
}

.score-val {
    font-size: 1.15rem;
    font-weight: 850;
    color: ${palette.ink};
}

.score-lbl {
    font-size: 0.65rem;
    color: ${palette.muted};
    text-transform: uppercase;
    font-weight: 600;
}

.score-divider {
    width: 1px;
    height: 24px;
    background: #e2e8f0;
}

.skill-extra-metric {
    margin-top: 14px;
}

.metric-tag {
    font-weight: 600;
    border-radius: 6px;
    padding: 2px 8px;
}

.advice-box {
    margin-top: 14px;
    background: #f8fafc;
    border-radius: 10px;
    padding: 12px;
    border: 1px dashed #e2e8f0;
}

.advice-header {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    color: ${palette.indigo};
    margin-bottom: 4px;
}

.advice-text {
    font-size: 0.82rem;
    color: #475569;
    line-height: 1.4;
}

.badge-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 16px 12px;
    text-align: center;
    height: 100%;
    transition: all 0.2s ease;
}

.badge-card.locked {
    opacity: 0.55;
    background: rgba(241, 245, 249, 0.4) !important;
}

.badge-card.unlocked:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 30px rgba(79, 70, 229, 0.08) !important;
}

.badge-icon {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-size: 1.25rem;
    margin-bottom: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
}

.badge-title {
    font-size: 0.82rem;
    font-weight: 700;
    color: ${palette.ink};
    line-height: 1.3;
    margin-bottom: 4px;
}

.badge-desc {
    font-size: 0.68rem;
    color: ${palette.muted};
    line-height: 1.25;
}

.custom-table {
    margin-top: 8px;
}

.custom-table .ant-table-thead > tr > th {
    background: #f8fafc !important;
    color: #475569 !important;
    font-weight: 700 !important;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    border-bottom: 1px solid #e2e8f0 !important;
}

.custom-table .ant-table-tbody > tr > td {
    padding: 14px 16px !important;
    border-bottom: 1px solid #f1f5f9 !important;
    font-size: 0.88rem;
}

.custom-table .ant-table-row:hover > td {
    background: #f8fafc !important;
}

.table-action-btn {
    border-radius: 8px !important;
    color: ${palette.muted} !important;
    transition: all 0.15s ease;
}

.table-action-btn:hover {
    color: ${palette.indigo} !important;
    background: ${palette.indigo}0d !important;
    transform: scale(1.05);
}
`;
