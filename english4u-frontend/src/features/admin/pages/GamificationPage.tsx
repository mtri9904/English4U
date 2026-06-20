import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Drawer, Skeleton, Empty, Avatar } from 'antd';
import {
    Trophy, Award, Crown,
    TrendingUp, Users, Search, ChevronLeft,
    ChevronRight, BarChart2, Clock,
    RefreshCw,
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Cell,
} from 'recharts';
import { useAdminUsersQuery, useAdminUserDetailQuery } from '@/features/admin/api/user.api';
import { formatDateTimeToMinute } from '@/shared/lib/dateTime';


const PAGE_SIZE = 10;

const RANK_COLORS = [
    'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', // 🥇
    'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)', // 🥈
    'linear-gradient(135deg, #cd7f32 0%, #a0522d 100%)', // 🥉
];

const LEVEL_COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];




function levelLabel(level: string | null) {
    if (!level) return { emoji: '🌱', label: 'Chưa xác định', color: '#94a3b8', bg: '#f1f5f9' };
    const lvlMap: Record<string, { emoji: string; label: string; color: string; bg: string }> = {
        Beginner:    { emoji: '🌱', label: 'Beginner',    color: '#10b981', bg: '#d1fae5' },
        Elementary:  { emoji: '📚', label: 'Elementary',  color: '#06b6d4', bg: '#cffafe' },
        Intermediate:{ emoji: '⚡', label: 'Intermediate', color: '#6366f1', bg: '#ede9fe' },
        'Upper-Intermediate': { emoji: '🔥', label: 'Upper-Int', color: '#f59e0b', bg: '#fef3c7' },
        Advanced:    { emoji: '🏆', label: 'Advanced',    color: '#8b5cf6', bg: '#f5f3ff' },
        Proficient:  { emoji: '👑', label: 'Proficient',  color: '#f43f5e', bg: '#ffe4e6' },
    };
    return lvlMap[level] ?? { emoji: '📖', label: level, color: '#475569', bg: '#f1f5f9' };
}


const container = {
    hidden: { opacity: 0 },
    show:   { opacity: 1, transition: { staggerChildren: 0.06 } },
} as const;
const item = {
    hidden: { opacity: 0, y: 20 },
    show:   { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 20 } },
} as const;


function scoreColor(s: number) {
    if (s >= 8) return '#10b981';
    if (s >= 6.5) return '#6366f1';
    if (s >= 5) return '#f59e0b';
    return '#ef4444';
}


function StatCard({ icon: Icon, label, value, gradient }: { icon: React.ElementType; label: string; value: string | number; gradient: string }) {
    return (
        <motion.div variants={item} style={{
            background: '#fff', borderRadius: 18, padding: '20px',
            border: '1px solid #f1f5f9',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 14px rgba(0,0,0,0.04)',
            display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 160,
        }}>
            <div style={{
                width: 48, height: 48, borderRadius: 13, flexShrink: 0,
                background: gradient,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 6px 20px ${gradient.includes('#6366f1') ? 'rgba(99,102,241,0.3)' : 'rgba(0,0,0,0.1)'}`,
            }}>
                <Icon size={22} color="#fff" strokeWidth={2} />
            </div>
            <div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.2, marginTop: 2 }}>{value}</div>
            </div>
        </motion.div>
    );
}


export const GamificationPage = () => {
    const [search, setSearch]       = useState('');
    const [page, setPage]           = useState(1);
    const [selectedId, setSelected] = useState('');
    const [sortBy, setSortBy]       = useState<'score' | 'level'>('score');

    const queryParams = useMemo(() => ({
        pageNumber: 1,
        pageSize: 200,
        searchTerm: search.trim() || undefined,
        sortBy: sortBy === 'score' ? 'averageScore' : 'currentLevel',
        sortDescending: true,
    }), [search, sortBy]);

    const { data: pagedData, isLoading, refetch, isFetching } = useAdminUsersQuery(queryParams);
    const { data: detail, isLoading: isDetailLoading }        = useAdminUserDetailQuery(selectedId, !!selectedId);

    const users = pagedData?.items ?? [];


    const stats = useMemo(() => {
        const withScore = users.filter(u => u.averageScore > 0);
        const avgBand   = withScore.length ? withScore.reduce((s, u) => s + u.averageScore, 0) / withScore.length : 0;
        const levelMap: Record<string, number> = {};
        for (const u of users) {
            const lv = u.currentLevel || 'N/A';
            levelMap[lv] = (levelMap[lv] || 0) + 1;
        }
        return { total: users.length, avgBand, levelMap };
    }, [users]);

    const levelChartData = useMemo(() =>
        Object.entries(stats.levelMap)
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => ({ name, count })),
        [stats.levelMap]);


    const totalPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
    const paginated  = users.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);


    const DetailDrawer = () => {
        if (!selectedId) return null;
        const lv = levelLabel(detail?.currentLevel ?? null);
        return (
            <Drawer
                open={!!selectedId}
                onClose={() => setSelected('')}
                width={500}
                styles={{
                    header: { borderBottom: '1px solid #f1f5f9', padding: '20px 24px' },
                    body:   { padding: 0, background: '#f8fafc' },
                }}
                title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#f59e0b,#ef4444)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Trophy size={16} color="#fff" />
                        </div>
                        <div>
                            <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a' }}>Hồ sơ thành tích</div>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 400 }}>Chi tiết gamification</div>
                        </div>
                    </div>
                }
            >
                {isDetailLoading || !detail ? (
                    <div style={{ padding: 24 }}>
                        <Skeleton active avatar paragraph={{ rows: 6 }} />
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>


                        <div style={{
                            background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
                            padding: '28px 24px 24px',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                <div style={{ position: 'relative' }}>
                                    <Avatar size={64} src={detail.avatarUrl}
                                        style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', fontWeight: 800, fontSize: '1.5rem', border: '3px solid rgba(255,255,255,0.2)' }}>
                                        {(detail.displayName || detail.email).charAt(0).toUpperCase()}
                                    </Avatar>
                                    <div style={{
                                        position: 'absolute', bottom: -4, right: -4,
                                        background: lv.bg, color: lv.color,
                                        borderRadius: 99, padding: '1px 6px',
                                        fontSize: '0.65rem', fontWeight: 800,
                                        border: '2px solid #0f172a',
                                    }}>{lv.emoji}</div>
                                </div>
                                <div>
                                    <div style={{ fontWeight: 800, fontSize: '1.125rem', color: '#fff' }}>{detail.displayName || 'Chưa đặt tên'}</div>
                                    <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: 2 }}>{detail.email}</div>
                                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                                        <span style={{ background: lv.bg, color: lv.color, padding: '3px 9px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 700 }}>
                                            {lv.emoji} {lv.label}
                                        </span>
                                        {detail.subscriptionName && (
                                            <span style={{ background: '#fef3c7', color: '#92400e', padding: '3px 9px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 700 }}>
                                                {detail.subscriptionName}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>


                            <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
                                {[
                                    { label: 'Band TB',   value: detail.averageScore > 0 ? detail.averageScore.toFixed(1) : '—', color: scoreColor(detail.averageScore) },
                                    { label: 'Bài đã thi', value: detail.totalExamsTaken },
                                ].map(({ label, value, color }) => (
                                    <div key={label} style={{
                                        flex: 1, background: 'rgba(255,255,255,0.08)', borderRadius: 12,
                                        padding: '12px 14px', border: '1px solid rgba(255,255,255,0.1)',
                                    }}>
                                        <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: color ?? '#fff', marginTop: 2 }}>{value}</div>
                                    </div>
                                ))}
                            </div>
                        </div>


                        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>


                            <div style={{ background: '#fff', borderRadius: 16, padding: '16px', border: '1px solid #f1f5f9' }}>
                                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.875rem', marginBottom: 12 }}>Thông tin tài khoản</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px' }}>
                                    {[
                                        { label: 'Vai trò',     value: detail.roleName || '—' },
                                        { label: 'Trạng thái',  value: detail.isActive ? '✅ Hoạt động' : '🔒 Bị khóa' },
                                        { label: 'Ngày tham gia', value: formatDateTimeToMinute(detail.createdAt) || '—' },
                                        { label: 'Đăng nhập cuối', value: formatDateTimeToMinute(detail.lastLoginAt) || '—' },
                                        { label: 'Hoạt động cuối', value: formatDateTimeToMinute(detail.lastSeenAt) || '—' },
                                        { label: 'Đang online',  value: detail.isOnline ? '🟢 Online' : '⚫ Offline' },
                                    ].map(({ label, value }) => (
                                        <div key={label}>
                                            <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                                            <div style={{ fontSize: '0.85rem', color: '#0f172a', fontWeight: 600, marginTop: 2 }}>{value}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>


                            {detail.recentSessions && detail.recentSessions.length > 0 && (
                                <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
                                    <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, color: '#0f172a', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <Clock size={14} color="#6366f1" />
                                        Lịch sử thi gần đây
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        {detail.recentSessions.map((s, i) => (
                                            <div key={s.sessionId} style={{
                                                padding: '12px 16px',
                                                borderBottom: i < detail.recentSessions.length - 1 ? '1px solid #f8fafc' : 'none',
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            }}>
                                                <div>
                                                    <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.85rem' }}>{s.examTitle}</div>
                                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 2 }}>{formatDateTimeToMinute(s.completedAt)}</div>
                                                </div>
                                                <span style={{
                                                    fontWeight: 800, fontSize: '1rem',
                                                    color: s.score > 0 ? scoreColor(s.score) : '#cbd5e1',
                                                }}>
                                                    {s.score > 0 ? s.score.toFixed(1) : '—'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </Drawer>
        );
    };

    return (
        <motion.div variants={container} initial="hidden" animate="show" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>


            <motion.div variants={item} style={{
                background: 'linear-gradient(135deg, #431462 0%, #1a0533 40%, #0f172a 100%)',
                borderRadius: 24, padding: '32px 36px',
                position: 'relative', overflow: 'hidden',
            }}>
                {[
                    { w: 280, top: -100, right: -60, op: 0.07, color: '#f59e0b' },
                    { w: 180, top:   30, right: 160, op: 0.05, color: '#8b5cf6' },
                    { w: 120, top: -20, right: 300, op: 0.06, color: '#ec4899' },
                ].map((c, i) => (
                    <div key={i} style={{
                        position: 'absolute', top: c.top, right: c.right,
                        width: c.w, height: c.w, borderRadius: '50%',
                        background: c.color, opacity: c.op,
                    }} />
                ))}


                <div style={{ position: 'absolute', right: 40, top: '50%', transform: 'translateY(-50%)', fontSize: '5rem', opacity: 0.08, userSelect: 'none' }}>
                    🏆
                </div>

                <div style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(245,158,11,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Trophy size={18} color="#f59e0b" />
                        </div>
                        <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: '0.85rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Thành tích & Cấp độ</span>
                    </div>
                    <h2 style={{ margin: '0 0 8px', fontSize: '1.875rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
                        Bảng xếp hạng học viên
                    </h2>
                    <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.9375rem', maxWidth: 560 }}>
                        Theo dõi cấp độ, điểm số và thành tích của từng học viên trong hệ thống.
                    </p>
                </div>
            </motion.div>


            <motion.div variants={item} style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <StatCard icon={Users}    label="Tổng học viên" value={isLoading ? '...' : stats.total}                                          gradient="linear-gradient(135deg,#6366f1,#8b5cf6)" />
                <StatCard icon={TrendingUp} label="Band TB"     value={isLoading ? '...' : (stats.avgBand > 0 ? stats.avgBand.toFixed(2) : '—')} gradient="linear-gradient(135deg,#10b981,#059669)" />
                <StatCard icon={Crown}    label="Số cấp độ"     value={isLoading ? '...' : Object.keys(stats.levelMap).length}                    gradient="linear-gradient(135deg,#f59e0b,#d97706)" />
                <StatCard icon={Award}    label="Cấp phổ biến"  value={isLoading ? '...' : (levelChartData[0]?.name || '—')}                      gradient="linear-gradient(135deg,#ec4899,#f43f5e)" />
            </motion.div>


            <motion.div variants={item} style={{
                background: '#fff', borderRadius: 20, padding: '24px',
                border: '1px solid #f1f5f9',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}>
                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '1rem', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <BarChart2 size={16} color="#6366f1" />
                    Phân bố học viên theo cấp độ
                </div>
                {isLoading ? (
                    <Skeleton active paragraph={{ rows: 4 }} />
                ) : levelChartData.length === 0 ? (
                    <Empty description="Chưa có dữ liệu" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: '24px 0' }} />
                ) : (
                    <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={levelChartData} barSize={40}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                            <Tooltip
                                cursor={{ fill: '#f8fafc' }}
                                contentStyle={{ background: '#0f172a', border: 'none', borderRadius: 10, color: '#fff', fontSize: 13 }}
                                formatter={(v) => [`${v} học viên`, '']}
                            />
                            <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                                {levelChartData.map((_, idx) => (
                                    <Cell key={idx} fill={LEVEL_COLORS[idx % LEVEL_COLORS.length]} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </motion.div>


            <motion.div variants={item} style={{
                background: '#fff', borderRadius: 20, border: '1px solid #f1f5f9',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)',
                overflow: 'hidden',
            }}>

                <div style={{ padding: '18px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>

                        <div style={{ position: 'relative' }}>
                            <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                            <input
                                value={search}
                                onChange={e => { setSearch(e.target.value); setPage(1); }}
                                placeholder="Tìm học viên, email..."
                                style={{
                                    paddingLeft: 34, paddingRight: 12, height: 38,
                                    border: '1px solid #e2e8f0', borderRadius: 10,
                                    fontSize: '0.875rem', color: '#0f172a', outline: 'none',
                                    width: 260, background: '#f8fafc',
                                }}
                                onFocus={e => (e.target.style.borderColor = '#f59e0b')}
                                onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
                            />
                        </div>

                        <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 10, padding: 3, gap: 2 }}>
                            {(['score', 'level'] as const).map(v => (
                                <button key={v} onClick={() => { setSortBy(v); setPage(1); }} style={{
                                    padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
                                    fontWeight: 600, fontSize: '0.8rem',
                                    background: sortBy === v ? '#fff' : 'transparent',
                                    color: sortBy === v ? '#0f172a' : '#64748b',
                                    boxShadow: sortBy === v ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                                    transition: 'all 0.2s',
                                }}>
                                    {v === 'score' ? '🏅 Điểm số' : '⭐ Cấp độ'}
                                </button>
                            ))}
                        </div>
                    </div>
                    <motion.button
                        whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                        onClick={() => refetch()}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '8px 16px', borderRadius: 10,
                            border: '1px solid #e2e8f0', background: '#fff',
                            fontWeight: 600, fontSize: '0.85rem', color: '#475569', cursor: 'pointer',
                        }}
                    >
                        <RefreshCw size={14} style={{ animation: isFetching ? 'spin 1s linear infinite' : 'none' }} />
                        Làm mới
                    </motion.button>
                </div>


                {isLoading ? (
                    <div style={{ padding: 24 }}><Skeleton active paragraph={{ rows: 8 }} /></div>
                ) : users.length === 0 ? (
                    <Empty description="Không có học viên nào" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: '48px 0' }} />
                ) : (
                    <>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc' }}>
                                        {['Hạng', 'Học viên', 'Cấp độ', 'Gói', 'Điểm TB', 'Trạng thái', ''].map(h => (
                                            <th key={h} style={{
                                                textAlign: 'left', padding: '11px 16px',
                                                fontSize: '0.75rem', fontWeight: 700, color: '#64748b',
                                                textTransform: 'uppercase', letterSpacing: '0.06em',
                                                borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap',
                                            }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    <AnimatePresence>
                                        {paginated.map((user, idx) => {
                                            const globalRank = (page - 1) * PAGE_SIZE + idx + 1;
                                            const lv = levelLabel(user.currentLevel);
                                            const isTop3 = globalRank <= 3;
                                            return (
                                                <motion.tr
                                                    key={user.id}
                                                    initial={{ opacity: 0, y: 6 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0 }}
                                                    transition={{ delay: idx * 0.03 }}
                                                    onMouseEnter={e => (e.currentTarget.style.background = '#fafafa')}
                                                    onMouseLeave={e => (e.currentTarget.style.background = isTop3 ? 'rgba(245,158,11,0.03)' : 'transparent')}
                                                    style={{
                                                        borderBottom: '1px solid #f8fafc',
                                                        background: isTop3 ? 'rgba(245,158,11,0.03)' : 'transparent',
                                                        transition: 'background 0.15s',
                                                    }}
                                                >

                                                    <td style={{ padding: '13px 16px', width: 60 }}>
                                                        {globalRank <= 3 ? (
                                                            <div style={{
                                                                width: 34, height: 34, borderRadius: 10,
                                                                background: RANK_COLORS[globalRank - 1],
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                fontWeight: 800, color: '#fff', fontSize: '1rem',
                                                                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                                            }}>
                                                                {globalRank === 1 ? '🥇' : globalRank === 2 ? '🥈' : '🥉'}
                                                            </div>
                                                        ) : (
                                                            <div style={{
                                                                width: 34, height: 34, borderRadius: 10,
                                                                background: '#f1f5f9',
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                fontWeight: 700, color: '#94a3b8', fontSize: '0.875rem',
                                                            }}>{globalRank}</div>
                                                        )}
                                                    </td>


                                                    <td style={{ padding: '13px 16px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                            <div style={{ position: 'relative' }}>
                                                                <Avatar size={38} src={user.avatarUrl}
                                                                    style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', fontWeight: 700, fontSize: '1rem' }}>
                                                                    {(user.displayName || user.email).charAt(0).toUpperCase()}
                                                                </Avatar>
                                                                {user.isOnline && (
                                                                    <div style={{ position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: '50%', background: '#10b981', border: '2px solid #fff' }} />
                                                                )}
                                                            </div>
                                                            <div>
                                                                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.875rem' }}>{user.displayName || '—'}</div>
                                                                <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{user.email}</div>
                                                            </div>
                                                        </div>
                                                    </td>


                                                    <td style={{ padding: '13px 16px' }}>
                                                        <span style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: 4,
                                                            padding: '4px 10px', borderRadius: 20,
                                                            background: lv.bg, color: lv.color,
                                                            fontSize: '0.75rem', fontWeight: 700,
                                                        }}>
                                                            {lv.emoji} {lv.label}
                                                        </span>
                                                    </td>


                                                    <td style={{ padding: '13px 16px' }}>
                                                        <span style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: 4,
                                                            padding: '3px 9px', borderRadius: 20,
                                                            background: user.subscriptionName === 'Premium' ? '#fef3c7' : user.subscriptionName === 'Pro' ? '#dbeafe' : '#f1f5f9',
                                                            color: user.subscriptionName === 'Premium' ? '#92400e' : user.subscriptionName === 'Pro' ? '#1d4ed8' : '#64748b',
                                                            fontSize: '0.72rem', fontWeight: 700,
                                                        }}>
                                                            {user.subscriptionName === 'Premium' && <Crown size={10} />}
                                                            {user.subscriptionName || 'Free'}
                                                        </span>
                                                    </td>


                                                    <td style={{ padding: '13px 16px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            <span style={{
                                                                fontWeight: 800, fontSize: '1.125rem',
                                                                color: user.averageScore > 0 ? scoreColor(user.averageScore) : '#cbd5e1',
                                                            }}>
                                                                {user.averageScore > 0 ? user.averageScore.toFixed(1) : '—'}
                                                            </span>
                                                            {user.averageScore > 0 && (
                                                                <div style={{ flex: 1, minWidth: 50, maxWidth: 70 }}>
                                                                    <div style={{ height: 4, background: '#f1f5f9', borderRadius: 99 }}>
                                                                        <div style={{
                                                                            height: '100%', borderRadius: 99,
                                                                            width: `${Math.min(100, (user.averageScore / 9) * 100)}%`,
                                                                            background: scoreColor(user.averageScore),
                                                                        }} />
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>


                                                    <td style={{ padding: '13px 16px' }}>
                                                        {!user.isActive ? (
                                                            <span style={{ color: '#ef4444', fontWeight: 600, fontSize: '0.8rem' }}>🔒 Bị khóa</span>
                                                        ) : user.isOnline ? (
                                                            <span style={{ color: '#10b981', fontWeight: 600, fontSize: '0.8rem' }}>🟢 Online</span>
                                                        ) : (
                                                            <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>⚫ Offline</span>
                                                        )}
                                                    </td>


                                                    <td style={{ padding: '13px 16px' }}>
                                                        <motion.button
                                                            whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.95 }}
                                                            onClick={() => setSelected(user.id)}
                                                            style={{
                                                                display: 'flex', alignItems: 'center', gap: 5,
                                                                padding: '6px 12px', borderRadius: 8,
                                                                background: '#fef3c7', border: 'none',
                                                                fontWeight: 600, fontSize: '0.8rem', color: '#92400e',
                                                                cursor: 'pointer',
                                                            }}
                                                        >
                                                            <Trophy size={12} />
                                                            Chi tiết
                                                        </motion.button>
                                                    </td>
                                                </motion.tr>
                                            );
                                        })}
                                    </AnimatePresence>
                                </tbody>
                            </table>
                        </div>


                        {totalPages > 1 && (
                            <div style={{ padding: '14px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                                    Hiển thị {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, users.length)} / {users.length} học viên
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <motion.button
                                        whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        disabled={page === 1}
                                        style={{
                                            width: 32, height: 32, borderRadius: 8,
                                            border: '1px solid #e2e8f0', background: page === 1 ? '#f8fafc' : '#fff',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            cursor: page === 1 ? 'not-allowed' : 'pointer',
                                            opacity: page === 1 ? 0.4 : 1,
                                        }}
                                    >
                                        <ChevronLeft size={14} color="#475569" />
                                    </motion.button>
                                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                                        const p = totalPages <= 5 ? i + 1 : Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                                        return (
                                            <motion.button key={p}
                                                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                                onClick={() => setPage(p)}
                                                style={{
                                                    width: 32, height: 32, borderRadius: 8,
                                                    border: p === page ? 'none' : '1px solid #e2e8f0',
                                                    background: p === page ? 'linear-gradient(135deg,#f59e0b,#d97706)' : '#fff',
                                                    color: p === page ? '#fff' : '#475569',
                                                    fontWeight: p === page ? 800 : 500,
                                                    fontSize: '0.8rem', cursor: 'pointer',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    boxShadow: p === page ? '0 4px 12px rgba(245,158,11,0.4)' : 'none',
                                                }}
                                            >{p}</motion.button>
                                        );
                                    })}
                                    <motion.button
                                        whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                        disabled={page === totalPages}
                                        style={{
                                            width: 32, height: 32, borderRadius: 8,
                                            border: '1px solid #e2e8f0', background: page === totalPages ? '#f8fafc' : '#fff',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            cursor: page === totalPages ? 'not-allowed' : 'pointer',
                                            opacity: page === totalPages ? 0.4 : 1,
                                        }}
                                    >
                                        <ChevronRight size={14} color="#475569" />
                                    </motion.button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </motion.div>

            <DetailDrawer />

            <style>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </motion.div>
    );
};
