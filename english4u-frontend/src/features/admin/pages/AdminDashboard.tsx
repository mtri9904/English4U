import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
    Users, BookOpen, Activity, CheckCircle2, Clock,
    TrendingUp, TrendingDown, BarChart2, Award,
    ArrowRight, Zap, UserCheck, WifiOff,
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { useAdminStatsQuery } from '@/features/admin/api/user.api';
import { useExamsQuery } from '@/features/admin/api/exam.api';
import { useAdminAttemptsQuery } from '@/features/admin/api/attempt.api';
import { Skeleton } from 'antd';
import { useNavigate } from 'react-router-dom';

// ─── Animation Variants ─────────────────────────────────────────────────────
const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.08 } },
} as const;
const item = {
    hidden: { opacity: 0, y: 24 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 20 } },
} as const;


// ─── Colour Palette ──────────────────────────────────────────────────────────
const CHART_COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const skillLabel: Record<string, string> = {
    Reading: 'Reading',
    Listening: 'Listening',
    Writing: 'Writing',
    Speaking: 'Speaking',
    FullTest: 'Full Test',
};

function getStatusColor(status: string) {
    switch (status?.toLowerCase()) {
        case 'completed': return { bg: '#d1fae5', text: '#065f46', dot: '#10b981' };
        case 'in_progress': return { bg: '#dbeafe', text: '#1e40af', dot: '#3b82f6' };
        case 'abandoned': return { bg: '#fee2e2', text: '#991b1b', dot: '#ef4444' };
        default: return { bg: '#f1f5f9', text: '#475569', dot: '#94a3b8' };
    }
}

function formatStatus(s: string) {
    switch (s?.toLowerCase()) {
        case 'completed': return 'Hoàn thành';
        case 'in_progress': return 'Đang thi';
        case 'abandoned': return 'Bỏ dở';
        default: return s;
    }
}

// ─── Sub Components ──────────────────────────────────────────────────────────
interface StatCardProps {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: React.ElementType;
    gradient: string;
    trend?: { value: string; up: boolean };
    loading?: boolean;
}

function StatCard({ title, value, subtitle, icon: Icon, gradient, trend, loading }: StatCardProps) {
    return (
        <motion.div variants={item} whileHover={{ y: -4 }} transition={{ type: 'spring', stiffness: 400 }}>
            <div style={{
                background: '#fff',
                borderRadius: 20,
                padding: '24px',
                border: '1px solid #f1f5f9',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)',
                position: 'relative',
                overflow: 'hidden',
                cursor: 'default',
            }}>
                {/* Decorative blob */}
                <div style={{
                    position: 'absolute', top: -30, right: -30,
                    width: 120, height: 120, borderRadius: '50%',
                    background: gradient, opacity: 0.08,
                }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: '0.8125rem', color: '#94a3b8', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                            {title}
                        </p>
                        {loading ? (
                            <Skeleton.Input active size="large" style={{ marginTop: 8, width: 100, height: 36 }} />
                        ) : (
                            <p style={{ margin: '8px 0 0', fontSize: '2.25rem', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>
                                {value}
                            </p>
                        )}
                        {subtitle && !loading && (
                            <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: '#64748b' }}>{subtitle}</p>
                        )}
                    </div>
                    <div style={{
                        width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                        background: gradient,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: `0 8px 24px ${gradient.slice(gradient.indexOf('#'), gradient.indexOf('#') + 7)}33`,
                    }}>
                        <Icon size={24} color="#fff" strokeWidth={2} />
                    </div>
                </div>
                {trend && !loading && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 14 }}>
                        {trend.up
                            ? <TrendingUp size={13} color="#10b981" />
                            : <TrendingDown size={13} color="#ef4444" />}
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: trend.up ? '#10b981' : '#ef4444' }}>
                            {trend.value}
                        </span>
                    </div>
                )}
            </div>
        </motion.div>
    );
}

// ─── Quick Action Card ────────────────────────────────────────────────────────
interface QuickActionProps {
    label: string;
    desc: string;
    icon: React.ElementType;
    color: string;
    onClick: () => void;
}

function QuickAction({ label, desc, icon: Icon, color, onClick }: QuickActionProps) {
    return (
        <motion.button
            variants={item}
            whileHover={{ scale: 1.02, boxShadow: '0 8px 32px rgba(0,0,0,0.10)' }}
            whileTap={{ scale: 0.98 }}
            onClick={onClick}
            style={{
                background: '#fff', border: '1px solid #f1f5f9', borderRadius: 16,
                padding: '18px 20px', cursor: 'pointer', textAlign: 'left', width: '100%',
                display: 'flex', alignItems: 'center', gap: 14,
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
        >
            <div style={{
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <Icon size={20} color={color} strokeWidth={2} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 700, color: '#0f172a', fontSize: '0.9rem' }}>{label}</p>
                <p style={{ margin: '2px 0 0', color: '#94a3b8', fontSize: '0.78rem' }}>{desc}</p>
            </div>
            <ArrowRight size={16} color="#cbd5e1" />
        </motion.button>
    );
}

// ─── Custom Tooltip for charts ────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; color: string }[]; label?: string }) {
    if (!active || !payload?.length) return null;
    return (
        <div style={{
            background: '#0f172a', borderRadius: 10, padding: '10px 16px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        }}>
            {label && <p style={{ margin: '0 0 6px', color: '#94a3b8', fontSize: '0.75rem' }}>{label}</p>}
            {payload.map((p, i) => (
                <p key={i} style={{ margin: 0, fontWeight: 700, color: p.color, fontSize: '0.9rem' }}>
                    {p.value} <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: '0.8rem' }}>{p.name}</span>
                </p>
            ))}
        </div>
    );
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ margin: 0, fontSize: '1.0625rem', fontWeight: 700, color: '#0f172a' }}>{title}</h3>
            {action}
        </div>
    );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export const AdminDashboard = () => {
    const navigate = useNavigate();

    const { data: userStats, isLoading: isUserStatsLoading } = useAdminStatsQuery();
    const { data: exams = [], isLoading: isExamsLoading } = useExamsQuery();
    const { data: attempts = [], isLoading: isAttemptsLoading } = useAdminAttemptsQuery({});

    // ── Derived exam stats ──
    const publishedExams = useMemo(() => exams.filter(e => e.isPublished), [exams]);
    const draftExams = useMemo(() => exams.filter(e => !e.isPublished), [exams]);

    // ── Exam by type (for bar chart) ──
    const examByType = useMemo(() => {
        const map: Record<string, number> = {};
        for (const e of exams) {
            const t = e.examType || 'Khác';
            map[t] = (map[t] || 0) + 1;
        }
        return Object.entries(map).map(([name, count]) => ({ name, count }));
    }, [exams]);

    // ── Attempts by skill (for pie) ──
    const attemptsBySkill = useMemo(() => {
        const map: Record<string, number> = {};
        for (const a of attempts) {
            const skill = skillLabel[a.skillType] || a.skillType || 'Khác';
            map[skill] = (map[skill] || 0) + 1;
        }
        return Object.entries(map).map(([name, value]) => ({ name, value }));
    }, [attempts]);

    // ── Attempts by status ──
    const completedAttempts = useMemo(() => attempts.filter(a => a.status?.toLowerCase() === 'completed').length, [attempts]);
    const inProgressAttempts = useMemo(() => attempts.filter(a => a.status?.toLowerCase() === 'in_progress').length, [attempts]);

    // ── Recent 6 attempts ──
    const recentAttempts = useMemo(() =>
        [...attempts]
            .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
            .slice(0, 6),
        [attempts]);

    // ── Average band score of completed attempts ──
    const avgBand = useMemo(() => {
        const withScore = attempts.filter(a => a.totalBandScore !== null);
        if (!withScore.length) return null;
        const avg = withScore.reduce((s, a) => s + (a.totalBandScore ?? 0), 0) / withScore.length;
        return avg.toFixed(1);
    }, [attempts]);

    // ── Top 5 exams by attempt count ──
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

            {/* ── Header ─────────────────────────────────────────────────── */}
            <motion.div variants={item} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                        <div style={{
                            width: 8, height: 8, borderRadius: '50%', background: '#10b981',
                            boxShadow: '0 0 0 3px #d1fae5',
                            animation: 'pulse 2s ease-in-out infinite',
                        }} />
                        <span style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 600 }}>Hệ thống hoạt động bình thường</span>
                    </div>
                    <h2 style={{ margin: 0, fontSize: '1.875rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
                        Tổng quan hệ thống
                    </h2>
                    <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.9375rem' }}>
                        English4U Admin — Dữ liệu cập nhật theo thời gian thực
                    </p>
                </div>
                <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => navigate('/admin/exams')}
                    style={{
                        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                        color: '#fff', border: 'none', borderRadius: 12,
                        padding: '10px 20px', fontWeight: 700, fontSize: '0.875rem',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                        boxShadow: '0 4px 16px rgba(99,102,241,0.35)',
                    }}
                >
                    <Zap size={15} />
                    Tạo đề thi mới
                </motion.button>
            </motion.div>

            {/* ── Stat Cards ─────────────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18 }}>
                <StatCard
                    title="Tổng học viên"
                    value={isUserStatsLoading ? '...' : (userStats?.totalUsers ?? 0).toLocaleString()}
                    subtitle={`${userStats?.premiumUsers ?? 0} học viên Premium`}
                    icon={Users}
                    gradient="linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)"
                    loading={isUserStatsLoading}
                />
                <StatCard
                    title="Đang trực tuyến"
                    value={isUserStatsLoading ? '...' : (userStats?.onlineUsers ?? 0)}
                    subtitle={`${userStats?.activeUsers ?? 0} tài khoản kích hoạt`}
                    icon={UserCheck}
                    gradient="linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)"
                    loading={isUserStatsLoading}
                />
                <StatCard
                    title="Đề thi đang mở"
                    value={isExamsLoading ? '...' : publishedExams.length}
                    subtitle={`${draftExams.length} bản nháp`}
                    icon={BookOpen}
                    gradient="linear-gradient(135deg, #10b981 0%, #059669 100%)"
                    loading={isExamsLoading}
                />
                <StatCard
                    title="Tổng lượt thi"
                    value={isAttemptsLoading ? '...' : attempts.length.toLocaleString()}
                    subtitle={`${completedAttempts} hoàn thành · ${inProgressAttempts} đang thi`}
                    icon={Activity}
                    gradient="linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)"
                    loading={isAttemptsLoading}
                />
                {avgBand !== null && (
                    <StatCard
                        title="Band TB (có điểm)"
                        value={avgBand ?? '—'}
                        subtitle="Trung bình band score"
                        icon={Award}
                        gradient="linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)"
                        loading={isAttemptsLoading}
                    />
                )}
                <StatCard
                    title="Điểm TB học viên"
                    value={isUserStatsLoading ? '...' : (userStats?.globalAverageScore?.toFixed(1) ?? '—')}
                    subtitle="Điểm trung bình toàn hệ thống"
                    icon={BarChart2}
                    gradient="linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)"
                    loading={isUserStatsLoading}
                />
            </div>

            {/* ── Charts Row ─────────────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 }}>

                {/* Bar chart: exams by type */}
                <motion.div variants={item} style={{
                    background: '#fff', borderRadius: 20, padding: '24px 20px',
                    border: '1px solid #f1f5f9',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)',
                }}>
                    <SectionHeader title="Đề thi theo loại" />
                    {isExamsLoading ? (
                        <Skeleton active paragraph={{ rows: 5 }} />
                    ) : examByType.length === 0 ? (
                        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>
                            Chưa có dữ liệu
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={examByType} barSize={36}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
                                <Bar dataKey="count" name="đề thi" radius={[8, 8, 0, 0]}>
                                    {examByType.map((_, idx) => (
                                        <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </motion.div>

                {/* Pie chart: attempts by skill */}
                <motion.div variants={item} style={{
                    background: '#fff', borderRadius: 20, padding: '24px 20px',
                    border: '1px solid #f1f5f9',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)',
                }}>
                    <SectionHeader title="Lượt thi theo kỹ năng" />
                    {isAttemptsLoading ? (
                        <Skeleton active paragraph={{ rows: 5 }} />
                    ) : attemptsBySkill.length === 0 ? (
                        <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>
                            Chưa có dữ liệu
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={220}>
                            <PieChart>
                                <Pie
                                    data={attemptsBySkill}
                                    cx="50%" cy="50%"
                                    innerRadius={55} outerRadius={85}
                                    paddingAngle={3}
                                    dataKey="value"
                                >
                                    {attemptsBySkill.map((_, idx) => (
                                        <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(v) => [`${v} lượt`, '']} />
                                <Legend
                                    iconType="circle"
                                    iconSize={8}
                                    formatter={(v) => <span style={{ fontSize: '0.8rem', color: '#475569' }}>{v}</span>}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                </motion.div>
            </div>

            {/* ── Bottom Row: Top Exams + Quick Actions + Recent Attempts ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20, alignItems: 'start' }}>

                {/* Left: Top Exams + Recent Attempts stacked */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                    {/* Top exams by attempts */}
                    <motion.div variants={item} style={{
                        background: '#fff', borderRadius: 20, padding: '24px',
                        border: '1px solid #f1f5f9',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)',
                    }}>
                        <SectionHeader
                            title="Top đề thi được luyện nhiều nhất"
                            action={
                                <button
                                    onClick={() => navigate('/admin/exams')}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4 }}
                                >
                                    Xem tất cả <ArrowRight size={13} />
                                </button>
                            }
                        />
                        {isAttemptsLoading ? (
                            <Skeleton active paragraph={{ rows: 4 }} />
                        ) : topExams.length === 0 ? (
                            <p style={{ color: '#94a3b8', textAlign: 'center', margin: '24px 0' }}>Chưa có dữ liệu lượt thi</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {topExams.map((exam, idx) => {
                                    const maxCount = topExams[0].count;
                                    const pct = maxCount > 0 ? (exam.count / maxCount) * 100 : 0;
                                    return (
                                        <div key={idx}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                                                    <span style={{
                                                        width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                                                        background: CHART_COLORS[idx % CHART_COLORS.length] + '20',
                                                        color: CHART_COLORS[idx % CHART_COLORS.length],
                                                        fontWeight: 800, fontSize: '0.75rem',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    }}>{idx + 1}</span>
                                                    <span style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exam.title}</span>
                                                    <span style={{
                                                        padding: '2px 8px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 600, flexShrink: 0,
                                                        background: exam.type === 'IELTS' ? '#ede9fe' : exam.type === 'TOEIC' ? '#dbeafe' : '#f0fdf4',
                                                        color: exam.type === 'IELTS' ? '#7c3aed' : exam.type === 'TOEIC' ? '#1d4ed8' : '#15803d',
                                                    }}>{exam.type}</span>
                                                </div>
                                                <span style={{ fontWeight: 700, color: '#475569', fontSize: '0.875rem', flexShrink: 0, marginLeft: 8 }}>{exam.count} lượt</span>
                                            </div>
                                            <div style={{ height: 5, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${pct}%` }}
                                                    transition={{ duration: 0.8, delay: idx * 0.1, ease: 'easeOut' }}
                                                    style={{ height: '100%', background: CHART_COLORS[idx % CHART_COLORS.length], borderRadius: 99 }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </motion.div>

                    {/* Recent Attempts */}
                    <motion.div variants={item} style={{
                        background: '#fff', borderRadius: 20, padding: '24px',
                        border: '1px solid #f1f5f9',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)',
                    }}>
                        <SectionHeader
                            title="Lượt thi gần đây"
                            action={
                                <button
                                    onClick={() => navigate('/admin/attempts')}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4 }}
                                >
                                    Xem tất cả <ArrowRight size={13} />
                                </button>
                            }
                        />
                        {isAttemptsLoading ? (
                            <Skeleton active paragraph={{ rows: 5 }} />
                        ) : recentAttempts.length === 0 ? (
                            <p style={{ color: '#94a3b8', textAlign: 'center', margin: '24px 0' }}>Chưa có lượt thi nào</p>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
                                    <thead>
                                        <tr>
                                            {['Học viên', 'Đề thi', 'Kỹ năng', 'Trạng thái', 'Band'].map(h => (
                                                <th key={h} style={{
                                                    textAlign: 'left', padding: '8px 12px',
                                                    fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8',
                                                    borderBottom: '1px solid #f1f5f9', textTransform: 'uppercase', letterSpacing: '0.05em',
                                                }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {recentAttempts.map((a, i) => {
                                            const sc = getStatusColor(a.status);
                                            return (
                                                <motion.tr
                                                    key={a.sessionId}
                                                    initial={{ opacity: 0, x: -8 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    transition={{ delay: 0.4 + i * 0.06 }}
                                                    onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                                    style={{ borderRadius: 8, cursor: 'default' }}
                                                >
                                                    <td style={{ padding: '11px 12px' }}>
                                                        <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.85rem' }}>{a.userDisplayName}</div>
                                                        <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{a.userEmail}</div>
                                                    </td>
                                                    <td style={{ padding: '11px 12px' }}>
                                                        <div style={{ fontWeight: 500, color: '#334155', fontSize: '0.85rem', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.examTitle}</div>
                                                    </td>
                                                    <td style={{ padding: '11px 12px' }}>
                                                        <span style={{ fontSize: '0.8rem', color: '#475569' }}>{skillLabel[a.skillType] ?? a.skillType}</span>
                                                    </td>
                                                    <td style={{ padding: '11px 12px' }}>
                                                        <span style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: 5,
                                                            padding: '3px 10px', borderRadius: 20,
                                                            background: sc.bg, color: sc.text,
                                                            fontSize: '0.75rem', fontWeight: 600,
                                                        }}>
                                                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: sc.dot, flexShrink: 0 }} />
                                                            {formatStatus(a.status)}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '11px 12px' }}>
                                                        <span style={{ fontWeight: 700, color: a.totalBandScore ? '#6366f1' : '#cbd5e1', fontSize: '0.9rem' }}>
                                                            {a.totalBandScore ?? '—'}
                                                        </span>
                                                    </td>
                                                </motion.tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </motion.div>
                </div>

                {/* Right: Quick Actions */}
                <motion.div variants={item} style={{
                    background: '#fff', borderRadius: 20, padding: '24px',
                    border: '1px solid #f1f5f9',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)',
                    display: 'flex', flexDirection: 'column', gap: 10,
                }}>
                    <h3 style={{ margin: '0 0 6px', fontSize: '1.0625rem', fontWeight: 700, color: '#0f172a' }}>Thao tác nhanh</h3>
                    <QuickAction
                        icon={Users}
                        label="Quản lý học viên"
                        desc="Xem, khoá, phân quyền tài khoản"
                        color="#6366f1"
                        onClick={() => navigate('/admin/users')}
                    />
                    <QuickAction
                        icon={BookOpen}
                        label="Quản lý đề thi"
                        desc="Tạo mới, chỉnh sửa, xuất bản"
                        color="#06b6d4"
                        onClick={() => navigate('/admin/exams')}
                    />
                    <QuickAction
                        icon={Activity}
                        label="Lượt thi"
                        desc="Giám sát, kiểm tra kết quả"
                        color="#10b981"
                        onClick={() => navigate('/admin/attempts')}
                    />
                    <QuickAction
                        icon={Award}
                        label="Thành tích & Cấp độ"
                        desc="Gamification, huy hiệu"
                        color="#f59e0b"
                        onClick={() => navigate('/admin/gamification')}
                    />

                    {/* Status summary box */}
                    <div style={{ marginTop: 8, background: '#f8fafc', borderRadius: 14, padding: '16px' }}>
                        <p style={{ margin: '0 0 10px', fontWeight: 700, fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            Tình trạng nhanh
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <CheckCircle2 size={14} color="#10b981" />
                                    <span style={{ fontSize: '0.82rem', color: '#475569' }}>Lượt hoàn thành</span>
                                </div>
                                <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.875rem' }}>{completedAttempts}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Clock size={14} color="#3b82f6" />
                                    <span style={{ fontSize: '0.82rem', color: '#475569' }}>Đang thi</span>
                                </div>
                                <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.875rem' }}>{inProgressAttempts}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <WifiOff size={14} color="#94a3b8" />
                                    <span style={{ fontSize: '0.82rem', color: '#475569' }}>Đã bỏ dở</span>
                                </div>
                                <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.875rem' }}>
                                    {attempts.filter(a => a.status?.toLowerCase() === 'abandoned').length}
                                </span>
                            </div>
                            <div style={{ height: 1, background: '#e2e8f0', margin: '2px 0' }} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <BookOpen size={14} color="#8b5cf6" />
                                    <span style={{ fontSize: '0.82rem', color: '#475569' }}>Đề bản nháp</span>
                                </div>
                                <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.875rem' }}>{draftExams.length}</span>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* Pulse animation */}
            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.6; transform: scale(1.3); }
                }
            `}</style>
        </motion.div>
    );
};
