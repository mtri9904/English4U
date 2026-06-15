import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Drawer, Skeleton, Empty } from 'antd';
import {
    Search, RefreshCw, Eye, CheckCircle2, Clock3,
    XCircle, Activity, Award, Users, BookOpen,
    ChevronLeft, ChevronRight, Calendar, Timer,
    BarChart2, Hash, Target, AlignLeft,
} from 'lucide-react';
import { useAdminAttemptDetailQuery, useAdminAttemptsQuery } from '../api/attempt.api';
import type { AdminAttemptAnswerDto, AdminAttemptListItemDto } from '../types/attempt.types';
import { formatDateTimeToMinute } from '@/shared/lib/dateTime';

// ─── Constants ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 10;

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string; icon: React.ElementType }> = {
    Completed:  { label: 'Hoàn thành', bg: '#d1fae5', text: '#065f46', dot: '#10b981', icon: CheckCircle2 },
    InProgress: { label: 'Đang thi',   bg: '#dbeafe', text: '#1e40af', dot: '#3b82f6', icon: Clock3 },
    Submitted:  { label: 'Đã nộp',     bg: '#fef3c7', text: '#92400e', dot: '#f59e0b', icon: CheckCircle2 },
    Abandoned:  { label: 'Bỏ dở',      bg: '#fee2e2', text: '#991b1b', dot: '#ef4444', icon: XCircle },
    NotStarted: { label: 'Chưa bắt đầu', bg: '#f1f5f9', text: '#475569', dot: '#94a3b8', icon: Clock3 },
};

const SKILL_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
    Reading:   { label: 'Reading',   bg: '#ede9fe', text: '#6d28d9' },
    Listening: { label: 'Listening', bg: '#dbeafe', text: '#1d4ed8' },
    Writing:   { label: 'Writing',   bg: '#fef3c7', text: '#92400e' },
    Speaking:  { label: 'Speaking',  bg: '#fce7f3', text: '#9d174d' },
    FullTest:  { label: 'Full Test', bg: '#d1fae5', text: '#065f46' },
};

const STATUS_OPTIONS = [
    { value: 'ALL', label: 'Tất cả trạng thái' },
    { value: 'Completed',  label: 'Hoàn thành' },
    { value: 'InProgress', label: 'Đang thi' },
    { value: 'Submitted',  label: 'Đã nộp' },
    { value: 'Abandoned',  label: 'Bỏ dở' },
    { value: 'NotStarted', label: 'Chưa bắt đầu' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const formatSeconds = (v?: number | null) => {
    if (v == null) return 'Không giới hạn';
    const m = Math.floor(Math.max(0, v) / 60);
    const s = Math.max(0, v) % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
};

const getStatus = (key: string) => STATUS_CONFIG[key] ?? { label: key, bg: '#f1f5f9', text: '#475569', dot: '#94a3b8', icon: Clock3 };
const getSkill  = (key: string) => SKILL_CONFIG[key]  ?? { label: key, bg: '#f1f5f9', text: '#64748b' };

// ─── Sub-components ───────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
    const cfg = getStatus(status);
    const Icon = cfg.icon;
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 20,
            background: cfg.bg, color: cfg.text,
            fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap',
        }}>
            <Icon size={11} strokeWidth={2.5} />
            {cfg.label}
        </span>
    );
}

function SkillBadge({ skill }: { skill: string }) {
    const cfg = getSkill(skill);
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 9px', borderRadius: 20,
            background: cfg.bg, color: cfg.text,
            fontSize: '0.72rem', fontWeight: 700,
        }}>
            {cfg.label}
        </span>
    );
}

interface MiniStatProps {
    label: string;
    value: string | number;
    icon: React.ElementType;
    color: string;
}
function MiniStat({ label, value, icon: Icon, color }: MiniStatProps) {
    return (
        <div style={{
            flex: 1, minWidth: 140,
            background: '#fff', borderRadius: 16,
            padding: '16px 18px',
            border: '1px solid #f1f5f9',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            display: 'flex', alignItems: 'center', gap: 12,
        }}>
            <div style={{
                width: 40, height: 40, borderRadius: 11, flexShrink: 0,
                background: color + '18',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <Icon size={18} color={color} strokeWidth={2} />
            </div>
            <div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                <div style={{ fontSize: '1.375rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.2, marginTop: 2 }}>{value}</div>
            </div>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export const AttemptManagementPage = () => {
    const [search, setSearch]             = useState('');
    const [selectedStatus, setStatus]     = useState('ALL');
    const [selectedSessionId, setSession] = useState('');
    const [page, setPage]                 = useState(1);

    const queryParams = useMemo(() => ({
        search: search.trim() || undefined,
        status: selectedStatus === 'ALL' ? undefined : selectedStatus,
    }), [search, selectedStatus]);

    const { data: attempts = [], isLoading, refetch, isFetching } = useAdminAttemptsQuery(queryParams);
    const { data: detail, isLoading: isDetailLoading }           = useAdminAttemptDetailQuery(selectedSessionId, !!selectedSessionId);

    // ── Stats ──
    const stats = useMemo(() => {
        const completed  = attempts.filter(a => a.status === 'Completed').length;
        const inProgress = attempts.filter(a => a.status === 'InProgress').length;
        const abandoned  = attempts.filter(a => a.status === 'Abandoned').length;
        const withBand   = attempts.filter((a): a is AdminAttemptListItemDto & { totalBandScore: number } => a.totalBandScore != null);
        const avgBand    = withBand.length ? (withBand.reduce((s, a) => s + a.totalBandScore, 0) / withBand.length) : null;
        const uniqueUsers = new Set(attempts.map(a => a.userId)).size;
        return { total: attempts.length, completed, inProgress, abandoned, avgBand, uniqueUsers };
    }, [attempts]);

    // ── Pagination ──
    const totalPages = Math.ceil(attempts.length / PAGE_SIZE);
    const paginated  = attempts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const handleSearch = (v: string) => { setSearch(v); setPage(1); };
    const handleStatus = (v: string) => { setStatus(v); setPage(1); };

    // ─── Drawer detail ───────────────────────────────────────────────────────
    const DetailDrawer = () => {
        if (!selectedSessionId) return null;
        return (
            <Drawer
                open={!!selectedSessionId}
                onClose={() => setSession('')}
                width={680}
                styles={{
                    header: { borderBottom: '1px solid #f1f5f9', padding: '20px 24px' },
                    body: { padding: 24, background: '#f8fafc' },
                }}
                title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Activity size={16} color="#fff" />
                        </div>
                        <div>
                            <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a' }}>Chi tiết lượt thi</div>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 400 }}>{selectedSessionId.slice(0, 16)}…</div>
                        </div>
                    </div>
                }
            >
                {isDetailLoading || !detail ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <Skeleton active paragraph={{ rows: 4 }} />
                        <Skeleton active paragraph={{ rows: 3 }} />
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                        {/* Info card */}
                        <div style={{ background: '#fff', borderRadius: 16, padding: 20, border: '1px solid #f1f5f9' }}>
                            <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 14, fontSize: '0.9rem' }}>Thông tin chung</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px' }}>
                                {[
                                    { icon: Users,    label: 'Học viên',    value: `${detail.userDisplayName}` },
                                    { icon: BookOpen, label: 'Đề thi',      value: detail.examTitle },
                                    { icon: Target,   label: 'Kỹ năng',     value: <SkillBadge skill={detail.skillType} /> },
                                    { icon: Activity, label: 'Trạng thái',  value: <StatusBadge status={detail.status} /> },
                                    { icon: Calendar, label: 'Bắt đầu',     value: formatDateTimeToMinute(detail.startedAt) || '—' },
                                    { icon: Calendar, label: 'Kết thúc',    value: formatDateTimeToMinute(detail.endedAt) || 'Chưa nộp' },
                                    { icon: Timer,    label: 'Thời gian còn', value: formatSeconds(detail.timeRemaining) },
                                    { icon: Hash,     label: 'Đang dừng tại', value: detail.resumeQuestionNumber ? `Câu ${detail.resumeQuestionNumber}` : '—' },
                                ].map(({ icon: Ic, label, value }) => (
                                    <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                        <Ic size={14} color="#94a3b8" style={{ marginTop: 2, flexShrink: 0 }} />
                                        <div>
                                            <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                                            <div style={{ fontSize: '0.875rem', color: '#0f172a', fontWeight: 600, marginTop: 2 }}>{value}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Score stats */}
                        {detail.result && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
                                {[
                                    { label: 'Đã trả lời', value: `${detail.answeredQuestions}/${detail.totalQuestions}`, color: '#6366f1' },
                                    { label: 'Band score',  value: detail.result.totalBandScore?.toFixed(1) ?? '—',        color: '#8b5cf6' },
                                    { label: 'Câu đúng',    value: detail.result.correctQuestions,                         color: '#10b981' },
                                    { label: 'Accuracy',    value: `${detail.result.accuracyPercent ?? 0}%`,               color: '#f59e0b' },
                                ].map(({ label, value, color }) => (
                                    <div key={label} style={{ background: '#fff', borderRadius: 14, padding: '14px 12px', border: '1px solid #f1f5f9', textAlign: 'center' }}>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color }}>{value}</div>
                                        <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 4, fontWeight: 600 }}>{label}</div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Answers list */}
                        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
                            <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <AlignLeft size={15} color="#6366f1" />
                                <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.9rem' }}>
                                    Danh sách câu trả lời ({detail.answers.length})
                                </span>
                            </div>
                            <div style={{ maxHeight: 420, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {detail.answers.length === 0 ? (
                                    <Empty description="Chưa có câu trả lời nào" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ margin: '24px 0' }} />
                                ) : detail.answers.map((ans: AdminAttemptAnswerDto) => (
                                    <div key={ans.questionId} style={{
                                        background: '#f8fafc', borderRadius: 12, padding: '12px 14px',
                                        border: `1px solid ${ans.isCorrect === true ? '#bbf7d0' : ans.isCorrect === false ? '#fecaca' : '#e2e8f0'}`,
                                        borderLeft: `3px solid ${ans.isCorrect === true ? '#10b981' : ans.isCorrect === false ? '#ef4444' : '#94a3b8'}`,
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                                <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.85rem' }}>Câu {ans.questionNumber ?? '?'}</span>
                                                {ans.groupType && (
                                                    <span style={{ background: '#ede9fe', color: '#6d28d9', padding: '1px 7px', borderRadius: 99, fontSize: '0.7rem', fontWeight: 600 }}>{ans.groupType}</span>
                                                )}
                                                {ans.isCorrect != null && (
                                                    <span style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: 3,
                                                        padding: '1px 7px', borderRadius: 99, fontSize: '0.7rem', fontWeight: 700,
                                                        background: ans.isCorrect ? '#d1fae5' : '#fee2e2',
                                                        color: ans.isCorrect ? '#065f46' : '#991b1b',
                                                    }}>
                                                        {ans.isCorrect ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                                                        {ans.isCorrect ? 'Đúng' : 'Sai'}
                                                    </span>
                                                )}
                                            </div>
                                            <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>{ans.scoreEarned} điểm</span>
                                        </div>
                                        {ans.questionContent && (
                                            <p style={{ margin: '8px 0 5px', fontSize: '0.8rem', color: '#475569', lineHeight: 1.5 }}>{ans.questionContent}</p>
                                        )}
                                        <div style={{ fontSize: '0.825rem', color: '#0f172a' }}>
                                            <span style={{ color: '#94a3b8', fontWeight: 600 }}>Trả lời: </span>
                                            <span style={{ fontWeight: 700 }}>{ans.submittedAnswer || 'Chưa nhập'}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </Drawer>
        );
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
        >

            {/* ── Hero Header ─────────────────────────────────────────── */}
            <div style={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 60%, #312e81 100%)',
                borderRadius: 24, padding: '32px 36px',
                position: 'relative', overflow: 'hidden',
            }}>
                {/* Decorative circles */}
                {[{ w: 240, top: -80, right: -40, op: 0.06 }, { w: 160, top: 20, right: 120, op: 0.05 }].map((c, i) => (
                    <div key={i} style={{
                        position: 'absolute', top: c.top, right: c.right,
                        width: c.w, height: c.w, borderRadius: '50%',
                        background: '#818cf8', opacity: c.op,
                    }} />
                ))}
                <div style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Activity size={18} color="#818cf8" />
                        </div>
                        <span style={{ color: '#818cf8', fontWeight: 700, fontSize: '0.85rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Quản lý lượt thi</span>
                    </div>
                    <h2 style={{ margin: '0 0 8px', fontSize: '1.875rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
                        Theo dõi lượt thi
                    </h2>
                    <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.9375rem', maxWidth: 560 }}>
                        Giám sát toàn bộ phiên làm bài — đang thi, đã nộp, kết quả chi tiết theo từng học viên.
                    </p>
                </div>
            </div>

            {/* ── Stat Cards ──────────────────────────────────────────── */}
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <MiniStat label="Tổng lượt thi"  value={stats.total}            icon={Activity}      color="#6366f1" />
                <MiniStat label="Hoàn thành"      value={stats.completed}        icon={CheckCircle2}  color="#10b981" />
                <MiniStat label="Đang thi"        value={stats.inProgress}       icon={Clock3}        color="#3b82f6" />
                <MiniStat label="Bỏ dở"           value={stats.abandoned}        icon={XCircle}       color="#ef4444" />
                <MiniStat label="Band TB"         value={stats.avgBand != null ? stats.avgBand.toFixed(1) : '—'} icon={Award} color="#f59e0b" />
                <MiniStat label="Học viên"        value={stats.uniqueUsers}      icon={Users}         color="#8b5cf6" />
            </div>

            {/* ── Table Card ──────────────────────────────────────────── */}
            <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)', overflow: 'hidden' }}>

                {/* Toolbar */}
                <div style={{ padding: '18px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        {/* Search */}
                        <div style={{ position: 'relative' }}>
                            <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                            <input
                                value={search}
                                onChange={e => handleSearch(e.target.value)}
                                placeholder="Tìm học viên, email, đề thi..."
                                style={{
                                    paddingLeft: 34, paddingRight: 12, height: 38,
                                    border: '1px solid #e2e8f0', borderRadius: 10,
                                    fontSize: '0.875rem', color: '#0f172a', outline: 'none',
                                    width: 280, background: '#f8fafc',
                                    transition: 'border-color 0.2s',
                                }}
                                onFocus={e => (e.target.style.borderColor = '#6366f1')}
                                onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
                            />
                        </div>

                        {/* Status filter */}
                        <select
                            value={selectedStatus}
                            onChange={e => handleStatus(e.target.value)}
                            style={{
                                height: 38, padding: '0 12px', borderRadius: 10,
                                border: '1px solid #e2e8f0', background: '#f8fafc',
                                fontSize: '0.875rem', color: '#0f172a', cursor: 'pointer', outline: 'none',
                            }}
                        >
                            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>

                    {/* Refresh */}
                    <motion.button
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => refetch()}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '8px 16px', borderRadius: 10,
                            border: '1px solid #e2e8f0', background: '#fff',
                            fontWeight: 600, fontSize: '0.85rem', color: '#475569',
                            cursor: 'pointer',
                        }}
                    >
                        <RefreshCw size={14} style={{ animation: isFetching ? 'spin 1s linear infinite' : 'none' }} />
                        Làm mới
                    </motion.button>
                </div>

                {/* Table */}
                {isLoading ? (
                    <div style={{ padding: 24 }}>
                        <Skeleton active paragraph={{ rows: 8 }} />
                    </div>
                ) : attempts.length === 0 ? (
                    <Empty description="Không có lượt thi nào khớp bộ lọc hiện tại" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: '48px 0' }} />
                ) : (
                    <>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc' }}>
                                        {['Học viên', 'Đề thi & Kỹ năng', 'Tiến độ', 'Trạng thái', 'Band', 'Bắt đầu', ''].map(h => (
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
                                        {paginated.map((a, i) => (
                                            <motion.tr
                                                key={a.sessionId}
                                                initial={{ opacity: 0, y: 6 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0 }}
                                                transition={{ delay: i * 0.03 }}
                                                onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                                style={{ borderBottom: '1px solid #f8fafc', cursor: 'default', transition: 'background 0.15s' }}
                                            >
                                                {/* Học viên */}
                                                <td style={{ padding: '13px 16px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                        <div style={{
                                                            width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                                                            background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            fontWeight: 800, color: '#fff', fontSize: '0.85rem',
                                                        }}>
                                                            {(a.userDisplayName || a.userEmail || '?').charAt(0).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.875rem' }}>{a.userDisplayName || '—'}</div>
                                                            <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{a.userEmail}</div>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Đề thi */}
                                                <td style={{ padding: '13px 16px', maxWidth: 220 }}>
                                                    <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.examTitle}</div>
                                                    <div style={{ display: 'flex', gap: 5, marginTop: 4 }}>
                                                        <SkillBadge skill={a.skillType} />
                                                        {a.examType && (
                                                            <span style={{ background: '#f1f5f9', color: '#64748b', padding: '2px 7px', borderRadius: 99, fontSize: '0.7rem', fontWeight: 600 }}>{a.examType}</span>
                                                        )}
                                                    </div>
                                                </td>

                                                {/* Tiến độ */}
                                                <td style={{ padding: '13px 16px' }}>
                                                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.875rem' }}>
                                                        {a.answeredQuestions}/{a.totalQuestions}
                                                    </div>
                                                    <div style={{ height: 4, background: '#f1f5f9', borderRadius: 99, marginTop: 5, width: 80 }}>
                                                        <div style={{
                                                            height: '100%', borderRadius: 99,
                                                            width: a.totalQuestions > 0 ? `${Math.round((a.answeredQuestions / a.totalQuestions) * 100)}%` : '0%',
                                                            background: 'linear-gradient(90deg,#6366f1,#8b5cf6)',
                                                            transition: 'width 0.5s ease',
                                                        }} />
                                                    </div>
                                                </td>

                                                {/* Trạng thái */}
                                                <td style={{ padding: '13px 16px' }}>
                                                    <StatusBadge status={a.status} />
                                                </td>

                                                {/* Band */}
                                                <td style={{ padding: '13px 16px' }}>
                                                    <span style={{
                                                        fontWeight: 800, fontSize: '1rem',
                                                        color: a.totalBandScore != null ? '#6366f1' : '#cbd5e1',
                                                    }}>
                                                        {a.totalBandScore != null ? a.totalBandScore.toFixed(1) : '—'}
                                                    </span>
                                                </td>

                                                {/* Bắt đầu */}
                                                <td style={{ padding: '13px 16px', color: '#64748b', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                                        <Calendar size={12} color="#94a3b8" />
                                                        {formatDateTimeToMinute(a.startedAt) || '—'}
                                                    </div>
                                                </td>

                                                {/* Action */}
                                                <td style={{ padding: '13px 16px' }}>
                                                    <motion.button
                                                        whileHover={{ scale: 1.06 }}
                                                        whileTap={{ scale: 0.95 }}
                                                        onClick={() => setSession(a.sessionId)}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: 5,
                                                            padding: '6px 12px', borderRadius: 8,
                                                            background: '#f1f5f9', border: 'none',
                                                            fontWeight: 600, fontSize: '0.8rem', color: '#475569',
                                                            cursor: 'pointer',
                                                        }}
                                                    >
                                                        <Eye size={13} />
                                                        Xem
                                                    </motion.button>
                                                </td>
                                            </motion.tr>
                                        ))}
                                    </AnimatePresence>
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div style={{ padding: '14px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                                    Hiển thị {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, attempts.length)} / {attempts.length} lượt thi
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <motion.button
                                        whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        disabled={page === 1}
                                        style={{
                                            width: 32, height: 32, borderRadius: 8, border: '1px solid #e2e8f0',
                                            background: page === 1 ? '#f8fafc' : '#fff',
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
                                            <motion.button
                                                key={p}
                                                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                                onClick={() => setPage(p)}
                                                style={{
                                                    width: 32, height: 32, borderRadius: 8,
                                                    border: p === page ? 'none' : '1px solid #e2e8f0',
                                                    background: p === page ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : '#fff',
                                                    color: p === page ? '#fff' : '#475569',
                                                    fontWeight: p === page ? 800 : 500,
                                                    fontSize: '0.8rem', cursor: 'pointer',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                }}
                                            >
                                                {p}
                                            </motion.button>
                                        );
                                    })}
                                    <motion.button
                                        whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                        disabled={page === totalPages}
                                        style={{
                                            width: 32, height: 32, borderRadius: 8, border: '1px solid #e2e8f0',
                                            background: page === totalPages ? '#f8fafc' : '#fff',
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
            </div>

            <DetailDrawer />

            {/* Spin keyframe */}
            <style>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </motion.div>
    );
};
