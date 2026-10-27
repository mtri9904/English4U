import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Modal, Form, Empty, Skeleton, message, Avatar } from 'antd';
import {
    Bell, ChevronLeft, ChevronRight, Megaphone,
} from 'lucide-react';
import {
    useAdminNotificationStatsQuery,
    useAdminNotificationsQuery,
    useBroadcastNotificationMutation,
    useDeleteNotificationMutation,
    useUpdateNotificationMutation,
    type NotificationListItemDto,
} from '@/features/notifications';
import { useAdminUsersQuery, type UserOverviewDto } from '@/features/students';
import {
    DEFAULT_FORM,
    PAGE_SIZE,
    LIVE_MS,
    type RoleFilter,
    type ReadFilter,
    type EditorMode,
    type NotificationFormValues,
} from '../constants/notification.constants';
import { resolveRole } from '../utils/notification.utils';
import { NotificationDetailDrawer } from '../components/NotificationDetailDrawer';
import { NotificationEditorModal } from '../components/NotificationEditorModal';
import { NotificationStatsRow } from '../components/NotificationStatsRow';
import { NotificationFilterBar } from '../components/NotificationFilterBar';
import { NotificationListItemCard } from '../components/NotificationListItemCard';

const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.06 } },
} as const;

const cardAnim = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 280, damping: 22 } },
} as const;

export const NotificationManagementPage = () => {
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL');
    const [readFilter, setReadFilter] = useState<ReadFilter>('ALL');
    const [pageNumber, setPage] = useState(1);
    const [pageSize] = useState(PAGE_SIZE);
    const [selected, setSelected] = useState<NotificationListItemDto | null>(null);
    const [editorOpen, setEditorOpen] = useState(false);
    const [editorMode, setEditorMode] = useState<EditorMode>('create');
    const [editing, setEditing] = useState<NotificationListItemDto | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [form] = Form.useForm<NotificationFormValues>();

    const [userSearchTerm, setUserSearchTerm] = useState('');
    const { data: usersPaged, isLoading: isUsersLoading } = useAdminUsersQuery(
        {
            pageNumber: 1,
            pageSize: 50,
            searchTerm: userSearchTerm.trim() || undefined,
            isActive: true,
        },
        {
            enabled: editorOpen && editorMode === 'create',
        },
    );

    const [selectedUsers, setSelectedUsers] = useState<UserOverviewDto[]>([]);

    const handleUsersChange = (values: string[]) => {
        const newSelected = [...selectedUsers];
        values.forEach((val) => {
            if (!newSelected.some((u) => u.id === val)) {
                const userObj = usersPaged?.items.find((u) => u.id === val);
                if (userObj) {
                    newSelected.push(userObj);
                }
            }
        });
        const filtered = newSelected.filter((u) => values.includes(u.id));
        setSelectedUsers(filtered);
        form.setFieldsValue({ targetUserIds: values });
    };

    const userOptions = useMemo(() => {
        return (usersPaged?.items ?? []).map((u) => ({
            label: (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 0' }}>
                    <Avatar src={u.avatarUrl || undefined} size="small" style={{ backgroundColor: '#0ea5e9', flexShrink: 0 }}>
                        {(u.displayName || u.email).charAt(0).toUpperCase()}
                    </Avatar>
                    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                        <span style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.85rem' }}>
                            {u.displayName || 'Chưa đặt tên'}
                        </span>
                        <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                            {u.roleName || 'Học viên'} • {u.email}
                        </span>
                    </div>
                </div>
            ),
            value: u.id,
            searchValue: `${u.displayName || ''} ${u.email || ''} ${u.roleName || ''}`,
        }));
    }, [usersPaged]);

    const queryParams = useMemo(
        () => ({
            pageNumber,
            pageSize,
            searchTerm: search.trim() || undefined,
            role: roleFilter === 'ALL' ? undefined : roleFilter,
            isRead: readFilter === 'ALL' ? undefined : readFilter === 'read',
        }),
        [pageNumber, pageSize, search, roleFilter, readFilter],
    );

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
    const updateMutation = useUpdateNotificationMutation();
    const deleteMutation = useDeleteNotificationMutation();

    const notifications = paged?.items ?? [];
    const totalCount = paged?.totalCount ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const isSaving = broadcastMutation.isPending || updateMutation.isPending;

    const openCreate = () => {
        setEditorMode('create');
        setEditing(null);
        setSelectedUsers([]);
        form.setFieldsValue(DEFAULT_FORM);
        setEditorOpen(true);
    };

    const openEdit = (item: NotificationListItemDto) => {
        setEditorMode('edit');
        setEditing(item);
        setSelectedUsers([]);
        form.setFieldsValue({
            title: item.title,
            message: item.message ?? '',
            targetType: 'role',
            targetRole: resolveRole(item.userRole),
            targetUserIds: [],
        });
        setEditorOpen(true);
    };

    const closeEditor = () => {
        if (isSaving) return;
        setEditorOpen(false);
        setEditing(null);
        setSelectedUsers([]);
        form.resetFields();
    };

    const handleSubmit = async () => {
        try {
            const v = await form.validateFields();
            const title = v.title.trim();
            const msg = v.message?.trim() || undefined;
            if (!title) {
                message.error('Vui lòng nhập tiêu đề.');
                return;
            }

            if (editorMode === 'create') {
                const payload: any = { title, message: msg };
                if (v.targetType === 'users') {
                    payload.userIds = v.targetUserIds;
                } else {
                    payload.targetRole = v.targetRole;
                }
                const res = await broadcastMutation.mutateAsync(payload);
                message.success(`✅ Đã gửi cho ${res.createdCount ?? 0} tài khoản.`);
            } else if (editing) {
                const res = await updateMutation.mutateAsync({ id: editing.id, payload: { title, message: msg } });
                message.success(`✅ Đã cập nhật ${res.updatedCount ?? 0} thông báo.`);
                if (selected?.id === editing.id) {
                    setSelected((prev) => (prev ? { ...prev, title, message: msg ?? null } : prev));
                }
            }
            closeEditor();
        } catch (err) {
            if (typeof err === 'object' && err !== null && 'errorFields' in err) return;
            message.error(editorMode === 'create' ? 'Gửi thông báo thất bại.' : 'Cập nhật thất bại.');
        }
    };

    const handleDelete = (item: NotificationListItemDto) => {
        Modal.confirm({
            title: 'Xóa thông báo này?',
            content: 'Toàn bộ bản ghi thuộc cùng lần gửi sẽ bị xóa vĩnh viễn.',
            okText: 'Xóa ngay',
            cancelText: 'Hủy',
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

    const handleSearchChange = (v: string) => {
        setSearch(v);
        setPage(1);
    };
    const handleRoleChange = (v: RoleFilter) => {
        setRoleFilter(v);
        setPage(1);
    };
    const handleReadChange = (v: ReadFilter) => {
        setReadFilter(v);
        setPage(1);
    };

    return (
        <motion.div variants={container} initial="hidden" animate="show" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Top Hero Banner */}
            <motion.div
                variants={cardAnim}
                style={{
                    background: 'linear-gradient(135deg, #1e3a8a 0%, #0f172a 55%, #1e1b4b 100%)',
                    borderRadius: 24,
                    padding: '30px 36px',
                    position: 'relative',
                    overflow: 'hidden',
                }}
            >
                {[
                    { w: 260, top: -90, right: -50, op: 0.07, c: '#60a5fa' },
                    { w: 150, top: 30, right: 180, op: 0.05, c: '#818cf8' },
                    { w: 90, top: -10, right: 360, op: 0.08, c: '#38bdf8' },
                ].map((d, i) => (
                    <div
                        key={i}
                        style={{
                            position: 'absolute',
                            top: d.top,
                            right: d.right,
                            width: d.w,
                            height: d.w,
                            borderRadius: '50%',
                            background: d.c,
                            opacity: d.op,
                            pointerEvents: 'none',
                        }}
                    />
                ))}
                <div style={{ position: 'absolute', right: 50, top: '50%', transform: 'translateY(-50%)', fontSize: '5rem', opacity: 0.06, userSelect: 'none' }}>
                    📣
                </div>

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
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={openCreate}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '12px 22px',
                            borderRadius: 13,
                            background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
                            border: 'none',
                            color: '#fff',
                            fontWeight: 700,
                            fontSize: '0.9rem',
                            cursor: 'pointer',
                            boxShadow: '0 6px 20px rgba(99,102,241,0.4)',
                        }}
                    >
                        <Megaphone size={17} />
                        Tạo thông báo
                    </motion.button>
                </div>
            </motion.div>

            {/* Stats Summary Cards */}
            <NotificationStatsRow stats={stats} isStatsLoading={isStatsLoading} />

            {/* Filter & Search Controls */}
            <NotificationFilterBar
                search={search}
                roleFilter={roleFilter}
                readFilter={readFilter}
                isFetching={isFetching}
                onSearchChange={handleSearchChange}
                onRoleChange={handleRoleChange}
                onReadChange={handleReadChange}
                onRefresh={() => refetch()}
            />

            {/* Notifications List Card */}
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
                            {notifications.map((item, idx) => (
                                <NotificationListItemCard
                                    key={item.id}
                                    item={item}
                                    idx={idx}
                                    isDeleting={deletingId === item.id && deleteMutation.isPending}
                                    onView={() => setSelected(item)}
                                    onEdit={() => openEdit(item)}
                                    onDelete={() => handleDelete(item)}
                                />
                            ))}
                        </AnimatePresence>
                    </div>
                )}

                {totalPages > 1 && (
                    <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                            {totalCount} thông báo · Trang {pageNumber}/{totalPages}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={pageNumber === 1}
                                style={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: 8,
                                    border: '1px solid #e2e8f0',
                                    background: pageNumber === 1 ? '#f8fafc' : '#fff',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: pageNumber === 1 ? 'not-allowed' : 'pointer',
                                    opacity: pageNumber === 1 ? 0.4 : 1,
                                }}
                            >
                                <ChevronLeft size={14} color="#475569" />
                            </motion.button>
                            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                                const p = totalPages <= 5 ? i + 1 : Math.max(1, Math.min(pageNumber - 2, totalPages - 4)) + i;
                                return (
                                    <motion.button
                                        key={p}
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={() => setPage(p)}
                                        style={{
                                            width: 32,
                                            height: 32,
                                            borderRadius: 8,
                                            border: p === pageNumber ? 'none' : '1px solid #e2e8f0',
                                            background: p === pageNumber ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : '#fff',
                                            color: p === pageNumber ? '#fff' : '#475569',
                                            fontWeight: p === pageNumber ? 800 : 500,
                                            fontSize: '0.8rem',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            boxShadow: p === pageNumber ? '0 4px 12px rgba(99,102,241,0.35)' : 'none',
                                        }}
                                    >
                                        {p}
                                    </motion.button>
                                );
                            })}
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                disabled={pageNumber === totalPages}
                                style={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: 8,
                                    border: '1px solid #e2e8f0',
                                    background: pageNumber === totalPages ? '#f8fafc' : '#fff',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: pageNumber === totalPages ? 'not-allowed' : 'pointer',
                                    opacity: pageNumber === totalPages ? 0.4 : 1,
                                }}
                            >
                                <ChevronRight size={14} color="#475569" />
                            </motion.button>
                        </div>
                    </div>
                )}
            </motion.div>

            {/* View Detail Drawer */}
            <NotificationDetailDrawer
                selected={selected}
                onClose={() => setSelected(null)}
                onEdit={(item) => openEdit(item)}
            />

            {/* Create & Edit Modal */}
            <NotificationEditorModal
                open={editorOpen}
                editorMode={editorMode}
                isSaving={isSaving}
                form={form}
                userOptions={userOptions}
                isUsersLoading={isUsersLoading}
                selectedUsers={selectedUsers}
                onSearchUsers={setUserSearchTerm}
                onUsersChange={handleUsersChange}
                onSubmit={handleSubmit}
                onClose={closeEditor}
            />

            <style>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </motion.div>
    );
};
