import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Drawer, Modal, Form, Input, Select, Empty, Skeleton, message, Avatar } from 'antd';
import {
    Bell, Send, Trash2, Pencil, Eye, RefreshCw,
    Search, Users, MailOpen, CalendarClock, CheckCheck,
    Filter, X, ChevronLeft, ChevronRight, Megaphone,
} from 'lucide-react';
import {
    useAdminNotificationStatsQuery,
    useAdminNotificationsQuery,
    useBroadcastNotificationMutation,
    useDeleteNotificationMutation,
    useUpdateNotificationMutation,
    type NotificationListItemDto,
} from '@/features/admin/api/notification.api';
import { formatDateTimeToMinute } from '@/shared/lib/dateTime';

// ─── Types ────────────────────────────────────────────────────────────────────
type RoleFilter = 'ALL' | 'Student' | 'Admin';
type ReadFilter = 'ALL' | 'read' | 'unread';
type EditorMode = 'create' | 'edit';

interface NotificationFormValues {
    title: string;
    message?: string;
    targetRole: RoleFilter;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 12;
const LIVE_MS   = 15_000;

const ROLE_OPTIONS: Array<{ label: string; value: RoleFilter }> = [
    { label: 'Tất cả vai trò', value: 'ALL' },
    { label: 'Học viên',       value: 'Student' },
    { label: 'Quản trị viên',  value: 'Admin' },
];

const ROLE_STYLE: Record<string, { bg: string; color: string; label: string }> = {
    Student: { bg: '#dbeafe', color: '#1d4ed8', label: 'Học viên' },
    Admin:   { bg: '#fee2e2', color: '#b91c1c', label: 'Quản trị' },
};

const DEFAULT_FORM: NotificationFormValues = { title: '', message: '', targetRole: 'Student' };

// ─── Helpers ─────────────────────────────────────────────────────────────────
function resolveRole(role: string): RoleFilter {
    return ROLE_OPTIONS.some(o => o.value === role) ? (role as RoleFilter) : 'ALL';
}

function avatarChar(name: string) {
    return (name || 'N').trim().charAt(0).toUpperCase();
}

function roleStyle(role: string) {
    return ROLE_STYLE[role] ?? { bg: '#f1f5f9', color: '#475569', label: role };
}

// ─── Animations ───────────────────────────────────────────────────────────────
const container = {
    hidden: { opacity: 0 },
    show:   { opacity: 1, transition: { staggerChildren: 0.06 } },
} as const;
const cardAnim = {
    hidden: { opacity: 0, y: 16 },
    show:   { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 280, damping: 22 } },
} as const;


// ─── Mini Stat ────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, gradient, loading }: {
    icon: React.ElementType; label: string; value: number | string;
    gradient: string; loading?: boolean;
}) {
    return (
        <div style={{
            flex: 1, minWidth: 150, background: '#fff', borderRadius: 18,
            padding: '18px 20px', border: '1px solid #f1f5f9',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            display: 'flex', alignItems: 'center', gap: 14,
        }}>
            <div style={{
                width: 46, height: 46, borderRadius: 13, flexShrink: 0,
                background: gradient,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <Icon size={20} color="#fff" strokeWidth={2} />
            </div>
            <div>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                {loading
                    ? <Skeleton.Input active size="small" style={{ width: 60, marginTop: 4 }} />
                    : <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.2, marginTop: 2 }}>{value}</div>}
            </div>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export const NotificationManagementPage = () => {
    const [search, setSearch]             = useState('');
    const [roleFilter, setRoleFilter]     = useState<RoleFilter>('ALL');
    const [readFilter, setReadFilter]     = useState<ReadFilter>('ALL');
    const [pageNumber, setPage]           = useState(1);
    const [pageSize]                      = useState(PAGE_SIZE);
    const [selected, setSelected]         = useState<NotificationListItemDto | null>(null);
    const [editorOpen, setEditorOpen]     = useState(false);
    const [editorMode, setEditorMode]     = useState<EditorMode>('create');
    const [editing, setEditing]           = useState<NotificationListItemDto | null>(null);
    const [deletingId, setDeletingId]     = useState<string | null>(null);
    const [form]                          = Form.useForm<NotificationFormValues>();

    const queryParams = useMemo(() => ({
        pageNumber,
        pageSize,
        searchTerm: search.trim() || undefined,
        role:   roleFilter === 'ALL' ? undefined : roleFilter,
        isRead: readFilter === 'ALL' ? undefined : readFilter === 'read',
    }), [pageNumber, pageSize, search, roleFilter, readFilter]);

    const {
        data: paged,
        isLoading,
        isFetching,
        refetch,
    } = useAdminNotificationsQuery(queryParams, {
        refetchInterval: LIVE_MS,
        refetchOnWindowFocus: true,
    });

    const { data: stats, isLoading: isStatsLoading } = useAdminNotificationStatsQuery({
        refetchInterval: LIVE_MS,
        refetchOnWindowFocus: true,
    });

    const broadcastMutation = useBroadcastNotificationMutation();
    const updateMutation    = useUpdateNotificationMutation();
    const deleteMutation    = useDeleteNotificationMutation();

    const notifications  = paged?.items ?? [];
    const totalCount     = paged?.totalCount ?? 0;
    const totalPages     = Math.max(1, Math.ceil(totalCount / pageSize));
    const isSaving       = broadcastMutation.isPending || updateMutation.isPending;

    // ── Open / Close editor ──────────────────────────────────────────────────
    const openCreate = () => {
        setEditorMode('create');
        setEditing(null);
        form.setFieldsValue(DEFAULT_FORM);
        setEditorOpen(true);
    };

    const openEdit = (item: NotificationListItemDto) => {
        setEditorMode('edit');
        setEditing(item);
        form.setFieldsValue({ title: item.title, message: item.message ?? '', targetRole: resolveRole(item.userRole) });
        setEditorOpen(true);
    };

    const closeEditor = () => {
        if (isSaving) return;
        setEditorOpen(false);
        setEditing(null);
        form.resetFields();
    };

    // ── Submit editor ────────────────────────────────────────────────────────
    const handleSubmit = async () => {
        try {
            const v = await form.validateFields();
            const title   = v.title.trim();
            const msg     = v.message?.trim() || undefined;
            if (!title) { message.error('Vui lòng nhập tiêu đề.'); return; }

            if (editorMode === 'create') {
                const res = await broadcastMutation.mutateAsync({ title, message: msg, targetRole: v.targetRole });
                message.success(`✅ Đã gửi cho ${res.createdCount ?? 0} tài khoản.`);
            } else if (editing) {
                const res = await updateMutation.mutateAsync({ id: editing.id, payload: { title, message: msg } });
                message.success(`✅ Đã cập nhật ${res.updatedCount ?? 0} thông báo.`);
                if (selected?.id === editing.id) {
                    setSelected(prev => prev ? { ...prev, title, message: msg ?? null } : prev);
                }
            }
            closeEditor();
        } catch (err) {
            if (typeof err === 'object' && err !== null && 'errorFields' in err) return;
            message.error(editorMode === 'create' ? 'Gửi thông báo thất bại.' : 'Cập nhật thất bại.');
        }
    };

    // ── Delete ───────────────────────────────────────────────────────────────
    const handleDelete = (item: NotificationListItemDto) => {
        Modal.confirm({
            title: 'Xóa thông báo này?',
            content: 'Toàn bộ bản ghi thuộc cùng lần gửi sẽ bị xóa vĩnh viễn.',
            okText: 'Xóa ngay', cancelText: 'Hủy',
            centered: true,
            okButtonProps: { danger: true },
            onOk: async () => {
                try {
                    setDeletingId(item.id);
                    const res = await deleteMutation.mutateAsync(item.id);
                    message.success(`🗑️ Đã xóa ${res.deletedCount ?? 0} thông báo.`);
                    if (selected?.id === item.id) setSelected(null);
                } catch {
                    message.error('Xóa thất bại.');
                } finally {
                    setDeletingId(null);
                }
            },
        });
    };

    const handleSearchChange = (v: string) => { setSearch(v); setPage(1); };
    const handleRoleChange   = (v: RoleFilter) => { setRoleFilter(v); setPage(1); };
    const handleReadChange   = (v: ReadFilter) => { setReadFilter(v); setPage(1); };

    return (
        <motion.div variants={container} initial="hidden" animate="show" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* ── Hero Header ─────────────────────────────────────────── */}
            <motion.div variants={cardAnim} style={{
                background: 'linear-gradient(135deg, #1e3a8a 0%, #0f172a 55%, #1e1b4b 100%)',
                borderRadius: 24, padding: '30px 36px',
                position: 'relative', overflow: 'hidden',
            }}>
                {[
                    { w: 260, top: -90, right: -50,  op: 0.07, c: '#60a5fa' },
                    { w: 150, top:  30, right: 180,  op: 0.05, c: '#818cf8' },
                    { w:  90, top: -10, right: 360,  op: 0.08, c: '#38bdf8' },
                ].map((d, i) => (
                    <div key={i} style={{
                        position: 'absolute', top: d.top, right: d.right,
                        width: d.w, height: d.w, borderRadius: '50%',
                        background: d.c, opacity: d.op, pointerEvents: 'none',
                    }} />
                ))}
                <div style={{ position: 'absolute', right: 50, top: '50%', transform: 'translateY(-50%)', fontSize: '5rem', opacity: 0.06, userSelect: 'none' }}>📣</div>

                <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(96,165,250,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Bell size={18} color="#60a5fa" />
                            </div>
                            <span style={{ color: '#60a5fa', fontWeight: 700, fontSize: '0.85rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                                Thông báo hệ thống
                            </span>
                        </div>
                        <h2 style={{ margin: '0 0 8px', fontSize: '1.875rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
                            Quản lý thông báo
                        </h2>
                        <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.9375rem', maxWidth: 520 }}>
                            Gửi, chỉnh sửa và theo dõi toàn bộ thông báo đến học viên và quản trị viên.
                        </p>
                    </div>

                    <motion.button
                        whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                        onClick={openCreate}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '12px 22px', borderRadius: 13,
                            background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
                            border: 'none', color: '#fff', fontWeight: 700, fontSize: '0.9rem',
                            cursor: 'pointer', boxShadow: '0 6px 20px rgba(99,102,241,0.4)',
                        }}
                    >
                        <Megaphone size={17} />
                        Tạo thông báo
                    </motion.button>
                </div>
            </motion.div>

            {/* ── Stat Cards ──────────────────────────────────────────── */}
            <motion.div variants={cardAnim} style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <StatCard icon={Bell}         label="Tổng thông báo"  value={stats?.total         ?? 0} gradient="linear-gradient(135deg,#6366f1,#8b5cf6)" loading={isStatsLoading} />
                <StatCard icon={MailOpen}     label="Chưa đọc"        value={stats?.unread        ?? 0} gradient="linear-gradient(135deg,#ef4444,#f97316)" loading={isStatsLoading} />
                <StatCard icon={CalendarClock} label="Mới hôm nay"    value={stats?.createdToday  ?? 0} gradient="linear-gradient(135deg,#06b6d4,#0ea5e9)" loading={isStatsLoading} />
                <StatCard icon={CheckCheck}   label="Đã đọc"          value={Math.max(0, (stats?.total ?? 0) - (stats?.unread ?? 0))} gradient="linear-gradient(135deg,#10b981,#059669)" loading={isStatsLoading} />
            </motion.div>

            {/* ── Toolbar ─────────────────────────────────────────────── */}
            <motion.div variants={cardAnim} style={{
                background: '#fff', borderRadius: 16, padding: '14px 18px',
                border: '1px solid #f1f5f9',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            }}>
                {/* Search */}
                <div style={{ position: 'relative', flex: 2, minWidth: 220 }}>
                    <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                    <input
                        value={search}
                        onChange={e => handleSearchChange(e.target.value)}
                        placeholder="Tìm tiêu đề, nội dung, tên hoặc email..."
                        style={{
                            width: '100%', paddingLeft: 34, paddingRight: 12, height: 38,
                            border: '1px solid #e2e8f0', borderRadius: 10, outline: 'none',
                            fontSize: '0.875rem', color: '#0f172a', background: '#f8fafc',
                            boxSizing: 'border-box',
                        }}
                        onFocus={e => (e.target.style.borderColor = '#6366f1')}
                        onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
                    />
                    {search && (
                        <button onClick={() => handleSearchChange('')} style={{
                            position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                            background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex',
                        }}>
                            <X size={13} color="#94a3b8" />
                        </button>
                    )}
                </div>

                {/* Role filter */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f1f5f9', borderRadius: 10, padding: '3px 4px' }}>
                    <Filter size={13} color="#94a3b8" style={{ marginLeft: 6 }} />
                    {ROLE_OPTIONS.map(o => (
                        <button key={o.value} onClick={() => handleRoleChange(o.value)} style={{
                            padding: '5px 11px', borderRadius: 7, border: 'none', cursor: 'pointer',
                            fontWeight: 600, fontSize: '0.78rem',
                            background: roleFilter === o.value ? '#fff' : 'transparent',
                            color: roleFilter === o.value ? '#0f172a' : '#64748b',
                            boxShadow: roleFilter === o.value ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                            transition: 'all 0.15s',
                            whiteSpace: 'nowrap',
                        }}>
                            {o.label}
                        </button>
                    ))}
                </div>

                {/* Read filter */}
                <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 10, padding: 3, gap: 2 }}>
                    {(['ALL', 'unread', 'read'] as ReadFilter[]).map(v => (
                        <button key={v} onClick={() => handleReadChange(v)} style={{
                            padding: '5px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
                            fontWeight: 600, fontSize: '0.78rem',
                            background: readFilter === v ? '#fff' : 'transparent',
                            color: readFilter === v ? '#0f172a' : '#64748b',
                            boxShadow: readFilter === v ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                            transition: 'all 0.15s',
                        }}>
                            {v === 'ALL' ? 'Tất cả' : v === 'unread' ? '🔴 Chưa đọc' : '✅ Đã đọc'}
                        </button>
                    ))}
                </div>

                {/* Refresh */}
                <motion.button
                    whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                    onClick={() => refetch()}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '8px 14px', borderRadius: 10,
                        border: '1px solid #e2e8f0', background: '#fff',
                        fontWeight: 600, fontSize: '0.82rem', color: '#475569', cursor: 'pointer',
                        marginLeft: 'auto',
                    }}
                >
                    <RefreshCw size={13} style={{ animation: isFetching ? 'spin 1s linear infinite' : 'none' }} />
                    Làm mới
                </motion.button>
            </motion.div>

            {/* ── Notification List ────────────────────────────────────── */}
            <motion.div variants={cardAnim}>
                {isLoading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {[...Array(4)].map((_, i) => (
                            <div key={i} style={{ background: '#fff', borderRadius: 16, padding: 20, border: '1px solid #f1f5f9' }}>
                                <Skeleton active avatar paragraph={{ rows: 2 }} />
                            </div>
                        ))}
                    </div>
                ) : notifications.length === 0 ? (
                    <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #f1f5f9', padding: '64px 0' }}>
                        <Empty description="Không có thông báo nào khớp bộ lọc" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <AnimatePresence>
                            {notifications.map((item, idx) => {
                                const rs = roleStyle(item.userRole);
                                const isDeleting = deletingId === item.id && deleteMutation.isPending;
                                return (
                                    <motion.div
                                        key={item.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.97 }}
                                        transition={{ delay: idx * 0.03, type: 'spring', stiffness: 280, damping: 22 }}
                                        style={{
                                            background: '#fff',
                                            borderRadius: 16,
                                            border: '1px solid #f1f5f9',
                                            borderLeft: `4px solid ${item.isRead ? '#e2e8f0' : '#6366f1'}`,
                                            padding: '16px 20px',
                                            boxShadow: item.isRead ? 'none' : '0 2px 12px rgba(99,102,241,0.06)',
                                            opacity: isDeleting ? 0.5 : 1,
                                            transition: 'opacity 0.2s',
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                                            {/* Left: info */}
                                            <div style={{ flex: 1, minWidth: 260 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                                    <Avatar size={36}
                                                        style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', fontWeight: 800, fontSize: '0.875rem', flexShrink: 0 }}>
                                                        {avatarChar(item.userDisplayName)}
                                                    </Avatar>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                            <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.9375rem' }}>{item.title}</span>
                                                            {!item.isRead && (
                                                                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#6366f1', flexShrink: 0 }} />
                                                            )}
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2, flexWrap: 'wrap' }}>
                                                            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                                                                <Users size={11} style={{ marginRight: 3, verticalAlign: 'middle' }} />
                                                                {item.userDisplayName}
                                                            </span>
                                                            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{item.userEmail}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {item.message && (
                                                    <p style={{
                                                        margin: '10px 0 0 46px', fontSize: '0.85rem',
                                                        color: '#475569', lineHeight: 1.55,
                                                        display: '-webkit-box', WebkitLineClamp: 2,
                                                        WebkitBoxOrient: 'vertical', overflow: 'hidden',
                                                    }}>
                                                        {item.message}
                                                    </p>
                                                )}

                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, marginLeft: 46, flexWrap: 'wrap' }}>
                                                    <span style={{
                                                        padding: '2px 9px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 700,
                                                        background: rs.bg, color: rs.color,
                                                    }}>{rs.label}</span>
                                                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                        <CalendarClock size={11} />
                                                        {formatDateTimeToMinute(item.createdAt) || 'N/A'}
                                                    </span>
                                                    <span style={{
                                                        padding: '2px 8px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 600,
                                                        background: item.isRead ? '#f0fdf4' : '#eff6ff',
                                                        color: item.isRead ? '#15803d' : '#1d4ed8',
                                                    }}>
                                                        {item.isRead ? '✓ Đã đọc' : '● Chưa đọc'}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Right: actions */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
                                                <ActionBtn icon={Eye} label="Xem" color="#6366f1" bg="#ede9fe" onClick={() => setSelected(item)} />
                                                <ActionBtn icon={Pencil} label="Sửa" color="#0ea5e9" bg="#e0f2fe" onClick={() => openEdit(item)} />
                                                <ActionBtn
                                                    icon={Trash2} label="Xóa" color="#ef4444" bg="#fee2e2"
                                                    loading={isDeleting}
                                                    onClick={() => handleDelete(item)}
                                                />
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                            {totalCount} thông báo · Trang {pageNumber}/{totalPages}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                onClick={() => setPage(p => Math.max(1, p - 1))} disabled={pageNumber === 1}
                                style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #e2e8f0', background: pageNumber === 1 ? '#f8fafc' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: pageNumber === 1 ? 'not-allowed' : 'pointer', opacity: pageNumber === 1 ? 0.4 : 1 }}>
                                <ChevronLeft size={14} color="#475569" />
                            </motion.button>
                            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                                const p = totalPages <= 5 ? i + 1 : Math.max(1, Math.min(pageNumber - 2, totalPages - 4)) + i;
                                return (
                                    <motion.button key={p} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setPage(p)}
                                        style={{ width: 32, height: 32, borderRadius: 8, border: p === pageNumber ? 'none' : '1px solid #e2e8f0', background: p === pageNumber ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : '#fff', color: p === pageNumber ? '#fff' : '#475569', fontWeight: p === pageNumber ? 800 : 500, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: p === pageNumber ? '0 4px 12px rgba(99,102,241,0.35)' : 'none' }}>
                                        {p}
                                    </motion.button>
                                );
                            })}
                            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={pageNumber === totalPages}
                                style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #e2e8f0', background: pageNumber === totalPages ? '#f8fafc' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: pageNumber === totalPages ? 'not-allowed' : 'pointer', opacity: pageNumber === totalPages ? 0.4 : 1 }}>
                                <ChevronRight size={14} color="#475569" />
                            </motion.button>
                        </div>
                    </div>
                )}
            </motion.div>

            {/* ── Detail Drawer ────────────────────────────────────────── */}
            <Drawer
                open={!!selected}
                onClose={() => setSelected(null)}
                width={520}
                styles={{
                    header: { borderBottom: '1px solid #f1f5f9', padding: '20px 24px' },
                    body:   { padding: 0, background: '#f8fafc' },
                }}
                title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Bell size={15} color="#fff" />
                        </div>
                        <div>
                            <div style={{ fontWeight: 800, fontSize: '0.9375rem', color: '#0f172a' }}>Chi tiết thông báo</div>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 400 }}>Xem đầy đủ nội dung</div>
                        </div>
                    </div>
                }
                extra={
                    selected && (
                        <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                            onClick={() => { openEdit(selected); }}
                            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 8, background: '#eff6ff', border: 'none', fontWeight: 600, fontSize: '0.82rem', color: '#2563eb', cursor: 'pointer' }}>
                            <Pencil size={13} /> Sửa nhanh
                        </motion.button>
                    )
                }
            >
                {selected && (
                    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {/* Recipient card */}
                        <div style={{ background: '#fff', borderRadius: 16, padding: '18px 20px', border: '1px solid #f1f5f9' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                                <Avatar size={48}
                                    style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', fontWeight: 800, fontSize: '1.2rem' }}>
                                    {avatarChar(selected.userDisplayName)}
                                </Avatar>
                                <div>
                                    <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '1rem' }}>{selected.userDisplayName}</div>
                                    <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{selected.userEmail}</div>
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
                                {[
                                    { label: 'Vai trò',      value: roleStyle(selected.userRole).label },
                                    { label: 'Trạng thái',   value: selected.isRead ? '✅ Đã đọc' : '🔴 Chưa đọc' },
                                    { label: 'Thời gian',    value: formatDateTimeToMinute(selected.createdAt) || '—' },
                                    { label: 'ID thông báo', value: selected.id.slice(0, 12) + '…' },
                                ].map(({ label, value }) => (
                                    <div key={label}>
                                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                                        <div style={{ fontSize: '0.85rem', color: '#0f172a', fontWeight: 600, marginTop: 2 }}>{value}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Title */}
                        <div style={{ background: '#fff', borderRadius: 16, padding: '18px 20px', border: '1px solid #f1f5f9' }}>
                            <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Tiêu đề</div>
                            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '1.0625rem', lineHeight: 1.45 }}>{selected.title}</div>
                        </div>

                        {/* Message */}
                        <div style={{ background: '#fff', borderRadius: 16, padding: '18px 20px', border: '1px solid #f1f5f9' }}>
                            <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Nội dung chi tiết</div>
                            <div style={{ color: '#334155', lineHeight: 1.7, fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>
                                {selected.message || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Không có nội dung chi tiết.</span>}
                            </div>
                        </div>
                    </div>
                )}
            </Drawer>

            {/* ── Editor Modal ─────────────────────────────────────────── */}
            <Modal
                open={editorOpen}
                onCancel={closeEditor}
                onOk={handleSubmit}
                okText={editorMode === 'create' ? 'Gửi thông báo' : 'Lưu thay đổi'}
                cancelText="Hủy"
                confirmLoading={isSaving}
                destroyOnClose
                width={540}
                title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
                        <div style={{
                            width: 34, height: 34, borderRadius: 9,
                            background: editorMode === 'create' ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'linear-gradient(135deg,#0ea5e9,#06b6d4)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            {editorMode === 'create' ? <Send size={16} color="#fff" /> : <Pencil size={16} color="#fff" />}
                        </div>
                        <span style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a' }}>
                            {editorMode === 'create' ? 'Tạo thông báo hệ thống' : 'Chỉnh sửa thông báo'}
                        </span>
                    </div>
                }
                styles={{
                    header: { borderBottom: '1px solid #f1f5f9', paddingBottom: 16, marginBottom: 0 },
                    body:   { paddingTop: 20 },
                }}
            >
                <Form layout="vertical" form={form} preserve={false} initialValues={DEFAULT_FORM}>
                    <Form.Item
                        label={<span style={{ fontWeight: 600, color: '#334155' }}>Vai trò nhận thông báo</span>}
                        name="targetRole"
                        rules={[{ required: true, message: 'Vui lòng chọn vai trò.' }]}
                    >
                        <Select
                            size="large"
                            disabled={editorMode === 'edit'}
                            options={ROLE_OPTIONS}
                            style={{ borderRadius: 10 }}
                        />
                    </Form.Item>

                    <Form.Item
                        label={<span style={{ fontWeight: 600, color: '#334155' }}>Tiêu đề thông báo</span>}
                        name="title"
                        rules={[
                            { required: true, message: 'Vui lòng nhập tiêu đề.' },
                            { max: 255, message: 'Tối đa 255 ký tự.' },
                        ]}
                    >
                        <Input
                            size="large" maxLength={255} showCount
                            placeholder="Ví dụ: Thông báo lịch thi tháng 7..."
                            style={{ borderRadius: 10 }}
                        />
                    </Form.Item>

                    <Form.Item
                        label={<span style={{ fontWeight: 600, color: '#334155' }}>Nội dung chi tiết</span>}
                        name="message"
                        rules={[{ max: 2000, message: 'Tối đa 2000 ký tự.' }]}
                    >
                        <Input.TextArea
                            rows={5} showCount maxLength={2000}
                            placeholder="Nhập nội dung thông báo gửi đến người dùng..."
                            style={{ borderRadius: 10, resize: 'none' }}
                        />
                    </Form.Item>

                    {editorMode === 'edit' && (
                        <div style={{
                            background: '#fffbeb', border: '1px solid #fde68a',
                            borderRadius: 10, padding: '10px 14px',
                            color: '#92400e', fontSize: '0.82rem', lineHeight: 1.5,
                            display: 'flex', gap: 8, alignItems: 'flex-start',
                        }}>
                            <span style={{ fontSize: '1rem' }}>ℹ️</span>
                            Vai trò nhận được giữ nguyên khi chỉnh sửa để tránh thay đổi nhầm phạm vi đã gửi.
                        </div>
                    )}
                </Form>
            </Modal>

            <style>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </motion.div>
    );
};

// ─── Action Button Helper ─────────────────────────────────────────────────────
function ActionBtn({ icon: Icon, label, color, bg, onClick, loading }: {
    icon: React.ElementType; label: string; color: string; bg: string;
    onClick: () => void; loading?: boolean;
}) {
    return (
        <motion.button
            whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.94 }}
            onClick={onClick}
            disabled={loading}
            title={label}
            style={{
                width: 34, height: 34, borderRadius: 9,
                background: loading ? '#f1f5f9' : bg, border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
            }}
        >
            <Icon size={15} color={loading ? '#94a3b8' : color} strokeWidth={2} />
        </motion.button>
    );
}
