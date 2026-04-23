import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
    Avatar,
    Button,
    Card,
    Drawer,
    Empty,
    Form,
    Input,
    Modal,
    Pagination,
    Select,
    Spin,
    Tag,
    Tooltip,
    message,
} from 'antd';
import {
    BellOutlined,
    DeleteOutlined,
    EditOutlined,
    EyeOutlined,
    PlusOutlined,
    SearchOutlined,
    SyncOutlined,
} from '@ant-design/icons';
import { AlertTriangle, Clock3, Mail, SendHorizontal, UserRound } from 'lucide-react';
import {
    useAdminNotificationStatsQuery,
    useAdminNotificationsQuery,
    useBroadcastNotificationMutation,
    useDeleteNotificationMutation,
    useUpdateNotificationMutation,
    type NotificationListItemDto,
} from '@/features/admin/api/notification.api';
import { formatDateTimeToMinute } from '@/shared/lib/dateTime';

type RoleFilter = 'ALL' | 'Student' | 'Admin' | 'Teacher' | 'ContentCreator';
type EditorMode = 'create' | 'edit';

interface NotificationFormValues {
    title: string;
    message?: string;
    targetRole: RoleFilter;
}

const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.06 },
    },
};

const itemVariants = {
    hidden: { opacity: 0, y: 14 },
    visible: { opacity: 1, y: 0 },
};

const roleOptions: Array<{ label: string; value: RoleFilter }> = [
    { label: 'Tất cả vai trò', value: 'ALL' },
    { label: 'Học viên', value: 'Student' },
    { label: 'Quản trị viên', value: 'Admin' },
    { label: 'Giáo viên', value: 'Teacher' },
    { label: 'Sáng tạo nội dung', value: 'ContentCreator' },
];

const defaultFormValues: NotificationFormValues = {
    title: '',
    message: '',
    targetRole: 'Student',
};

const getAvatarLabel = (name: string) => {
    if (!name || !name.trim()) {
        return 'N';
    }

    return name.trim().charAt(0).toUpperCase();
};

const resolveEditableRole = (role: string): RoleFilter =>
    roleOptions.some((option) => option.value === role) ? (role as RoleFilter) : 'ALL';

export const NotificationManagementPage = () => {
    const LIVE_REFRESH_INTERVAL_MS = 15_000;

    const [searchText, setSearchText] = useState('');
    const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL');
    const [pageNumber, setPageNumber] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [selectedNotification, setSelectedNotification] = useState<NotificationListItemDto | null>(null);
    const [isEditorModalOpen, setIsEditorModalOpen] = useState(false);
    const [editorMode, setEditorMode] = useState<EditorMode>('create');
    const [editingNotification, setEditingNotification] = useState<NotificationListItemDto | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [form] = Form.useForm<NotificationFormValues>();

    const queryParams = useMemo(
        () => ({
            pageNumber,
            pageSize,
            searchTerm: searchText.trim() || undefined,
            role: roleFilter === 'ALL' ? undefined : roleFilter,
        }),
        [pageNumber, pageSize, searchText, roleFilter]
    );

    const {
        data: pagedNotifications,
        isLoading: isListLoading,
        isFetching: isListFetching,
        refetch: refetchNotifications,
    } = useAdminNotificationsQuery(queryParams, {
        refetchInterval: LIVE_REFRESH_INTERVAL_MS,
        refetchOnWindowFocus: true,
    });

    const { data: notificationStats, isLoading: isStatsLoading } = useAdminNotificationStatsQuery({
        refetchInterval: LIVE_REFRESH_INTERVAL_MS,
        refetchOnWindowFocus: true,
    });

    const broadcastMutation = useBroadcastNotificationMutation();
    const updateNotificationMutation = useUpdateNotificationMutation();
    const deleteNotificationMutation = useDeleteNotificationMutation();

    const notifications = pagedNotifications?.items ?? [];
    const isSavingEditor = broadcastMutation.isPending || updateNotificationMutation.isPending;

    const openCreateModal = () => {
        setEditorMode('create');
        setEditingNotification(null);
        form.setFieldsValue(defaultFormValues);
        setIsEditorModalOpen(true);
    };

    const openEditModal = (item: NotificationListItemDto) => {
        setEditorMode('edit');
        setEditingNotification(item);
        form.setFieldsValue({
            title: item.title,
            message: item.message ?? '',
            targetRole: resolveEditableRole(item.userRole),
        });
        setIsEditorModalOpen(true);
    };

    const closeEditorModal = () => {
        if (isSavingEditor) {
            return;
        }

        setIsEditorModalOpen(false);
        setEditingNotification(null);
        form.resetFields();
    };

    const handleSubmitEditor = async () => {
        try {
            const values = await form.validateFields();
            const normalizedTitle = values.title.trim();
            const normalizedMessage = values.message?.trim() || undefined;

            if (!normalizedTitle) {
                message.error('Vui lòng nhập tiêu đề thông báo.');
                return;
            }

            if (editorMode === 'create') {
                const result = await broadcastMutation.mutateAsync({
                    title: normalizedTitle,
                    message: normalizedMessage,
                    targetRole: values.targetRole,
                });
                message.success(`Đã gửi thông báo cho ${result.createdCount ?? 0} tài khoản.`);
            } else if (editingNotification) {
                const result = await updateNotificationMutation.mutateAsync({
                    id: editingNotification.id,
                    payload: {
                        title: normalizedTitle,
                        message: normalizedMessage,
                    },
                });
                message.success(`Đã cập nhật ${result.updatedCount ?? 0} thông báo.`);

                if (selectedNotification?.id === editingNotification.id) {
                    setSelectedNotification((prev) =>
                        prev
                            ? {
                                ...prev,
                                title: normalizedTitle,
                                message: normalizedMessage ?? null,
                            }
                            : prev
                    );
                }
            }

            closeEditorModal();
        } catch (error) {
            if (typeof error === 'object' && error !== null && 'errorFields' in error) {
                return;
            }
            message.error(editorMode === 'create' ? 'Tạo thông báo thất bại.' : 'Cập nhật thông báo thất bại.');
        }
    };

    const handleDeleteNotification = (item: NotificationListItemDto) => {
        Modal.confirm({
            title: 'Xóa thông báo này?',
            content: 'Thao tác sẽ xóa toàn bộ bản ghi thuộc cùng một lần gửi.',
            okText: 'Xóa',
            cancelText: 'Hủy',
            centered: true,
            okButtonProps: { danger: true },
            onOk: async () => {
                try {
                    setDeletingId(item.id);
                    const result = await deleteNotificationMutation.mutateAsync(item.id);
                    message.success(`Đã xóa ${result.deletedCount ?? 0} thông báo.`);

                    if (selectedNotification?.id === item.id) {
                        setSelectedNotification(null);
                    }
                } catch {
                    message.error('Xóa thông báo thất bại.');
                } finally {
                    setDeletingId(null);
                }
            },
        });
    };

    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            style={{ display: 'flex', flexDirection: 'column', gap: 18 }}
        >
            <motion.div variants={itemVariants}>
                <div
                    style={{
                        borderRadius: 20,
                        padding: 24,
                        background:
                            'radial-gradient(circle at 0% 0%, rgba(56, 189, 248, 0.45), transparent 38%), linear-gradient(120deg, #1d4ed8 0%, #0f172a 70%)',
                        border: '1px solid rgba(148, 163, 184, 0.35)',
                        color: '#fff',
                        position: 'relative',
                        overflow: 'hidden',
                    }}
                >
                    <div
                        style={{
                            position: 'absolute',
                            width: 220,
                            height: 220,
                            borderRadius: '999px',
                            background: 'rgba(56, 189, 248, 0.22)',
                            right: -70,
                            top: -80,
                        }}
                    />
                    <div
                        style={{
                            position: 'relative',
                            zIndex: 1,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 12,
                            flexWrap: 'wrap',
                        }}
                    >
                        <div>
                            <div style={{ fontSize: '1.65rem', fontWeight: 800, marginBottom: 6 }}>
                                Thông Báo Hệ Thống
                            </div>
                            <div style={{ color: 'rgba(226, 232, 240, 0.94)', maxWidth: 720 }}>
                                Quản lý gửi thông báo, cập nhật nhanh nội dung và theo dõi từng đợt phát hành từ CMS.
                            </div>
                        </div>
                        <Button
                            icon={<PlusOutlined />}
                            size="large"
                            onClick={openCreateModal}
                            style={{
                                borderRadius: 12,
                                border: '1px solid rgba(226, 232, 240, 0.42)',
                                color: '#fff',
                                background: 'rgba(15, 23, 42, 0.3)',
                                fontWeight: 700,
                            }}
                        >
                            Tạo thông báo
                        </Button>
                    </div>
                </div>
            </motion.div>

            <motion.div
                variants={itemVariants}
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 12,
                }}
            >
                <Card style={{ borderRadius: 14, border: '1px solid #dbeafe' }} loading={isStatsLoading}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <div style={{ color: '#64748b', fontSize: '0.82rem' }}>Tổng thông báo</div>
                            <div style={{ color: '#0f172a', fontSize: '1.55rem', fontWeight: 800 }}>
                                {notificationStats?.total ?? 0}
                            </div>
                        </div>
                        <BellOutlined style={{ fontSize: 20, color: '#2563eb' }} />
                    </div>
                </Card>
                <Card style={{ borderRadius: 14, border: '1px solid #dcfce7' }} loading={isStatsLoading}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <div style={{ color: '#64748b', fontSize: '0.82rem' }}>Đã gửi thành công</div>
                            <div style={{ color: '#0f172a', fontSize: '1.55rem', fontWeight: 800 }}>
                                {notificationStats?.total ?? 0}
                            </div>
                        </div>
                        <Mail size={20} color="#16a34a" />
                    </div>
                </Card>
                <Card style={{ borderRadius: 14, border: '1px solid #fee2e2' }} loading={isStatsLoading}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <div style={{ color: '#64748b', fontSize: '0.82rem' }}>Mới hôm nay</div>
                            <div style={{ color: '#0f172a', fontSize: '1.55rem', fontWeight: 800 }}>
                                {notificationStats?.createdToday ?? 0}
                            </div>
                        </div>
                        <AlertTriangle size={20} color="#dc2626" />
                    </div>
                </Card>
                <Card style={{ borderRadius: 14, border: '1px solid #ede9fe' }} loading={isListLoading}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <div style={{ color: '#64748b', fontSize: '0.82rem' }}>Hiển thị trang hiện tại</div>
                            <div style={{ color: '#0f172a', fontSize: '1.55rem', fontWeight: 800 }}>
                                {notifications.length}
                            </div>
                        </div>
                        <Clock3 size={20} color="#7c3aed" />
                    </div>
                </Card>
            </motion.div>

            <motion.div variants={itemVariants}>
                <Card style={{ borderRadius: 14, border: '1px solid #e2e8f0' }} styles={{ body: { padding: 14 } }}>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <Input
                            value={searchText}
                            onChange={(event) => {
                                setSearchText(event.target.value);
                                setPageNumber(1);
                            }}
                            size="large"
                            allowClear
                            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                            placeholder="Tìm theo tiêu đề, nội dung, email hoặc tên người nhận..."
                            style={{ minWidth: 260, flex: 2, borderRadius: 10, height: 40 }}
                        />
                        <Select
                            value={roleFilter}
                            onChange={(value) => {
                                setRoleFilter(value);
                                setPageNumber(1);
                            }}
                            size="large"
                            style={{ minWidth: 190, flex: 1, height: 40 }}
                            options={roleOptions}
                        />
                        <Button
                            icon={<SyncOutlined spin={isListFetching} />}
                            style={{ borderRadius: 10, height: 40 }}
                            onClick={() => refetchNotifications()}
                        >
                            Làm mới
                        </Button>
                    </div>
                </Card>
            </motion.div>

            <motion.div variants={itemVariants}>
                <Card style={{ borderRadius: 14, border: '1px solid #e2e8f0' }}>
                    {isListLoading ? (
                        <div style={{ display: 'grid', placeItems: 'center', minHeight: 180 }}>
                            <Spin size="large" />
                        </div>
                    ) : notifications.length === 0 ? (
                        <Empty description="Không có thông báo phù hợp bộ lọc hiện tại." />
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {notifications.map((item) => (
                                <motion.div
                                    key={item.id}
                                    whileHover={{ y: -1 }}
                                    transition={{ type: 'spring', stiffness: 280, damping: 20 }}
                                    style={{
                                        borderRadius: 12,
                                        border: '1px solid #dbeafe',
                                        borderLeft: '4px solid #2563eb',
                                        padding: 14,
                                        background:
                                            'linear-gradient(120deg, rgba(239, 246, 255, 0.96) 0%, rgba(248, 250, 252, 0.9) 100%)',
                                    }}
                                >
                                    <div
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            gap: 12,
                                            alignItems: 'flex-start',
                                            flexWrap: 'wrap',
                                        }}
                                    >
                                        <div style={{ minWidth: 320, flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                                <Avatar size={34} style={{ background: '#2563eb', fontWeight: 700 }}>
                                                    {getAvatarLabel(item.userDisplayName)}
                                                </Avatar>
                                                <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '1rem' }}>
                                                    {item.title}
                                                </div>
                                            </div>
                                            <div
                                                style={{
                                                    color: '#475569',
                                                    marginTop: 8,
                                                    lineHeight: 1.55,
                                                    whiteSpace: 'pre-wrap',
                                                    maxHeight: 52,
                                                    overflow: 'hidden',
                                                }}
                                            >
                                                {item.message || 'Không có nội dung chi tiết.'}
                                            </div>
                                            <div
                                                style={{
                                                    color: '#64748b',
                                                    marginTop: 10,
                                                    fontSize: '0.82rem',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 12,
                                                    flexWrap: 'wrap',
                                                }}
                                            >
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                    <UserRound size={14} />
                                                    {item.userDisplayName}
                                                </span>
                                                <span>{item.userEmail}</span>
                                                <span>Tạo lúc: {formatDateTimeToMinute(item.createdAt) || 'N/A'}</span>
                                            </div>
                                        </div>

                                        <div
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 8,
                                                flexWrap: 'wrap',
                                                justifyContent: 'flex-end',
                                            }}
                                        >
                                            <Tag style={{ margin: 0 }}>{item.userRole}</Tag>
                                            <Tooltip title="Xem chi tiết">
                                                <Button size="small" icon={<EyeOutlined />} onClick={() => setSelectedNotification(item)}>
                                                    Chi tiết
                                                </Button>
                                            </Tooltip>
                                            <Tooltip title="Sửa nội dung">
                                                <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(item)}>
                                                    Sửa
                                                </Button>
                                            </Tooltip>
                                            <Tooltip title="Xóa toàn bộ đợt gửi này">
                                                <Button
                                                    size="small"
                                                    danger
                                                    icon={<DeleteOutlined />}
                                                    loading={deletingId === item.id && deleteNotificationMutation.isPending}
                                                    onClick={() => handleDeleteNotification(item)}
                                                >
                                                    Xóa
                                                </Button>
                                            </Tooltip>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}

                    <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                        <Pagination
                            current={pageNumber}
                            pageSize={pageSize}
                            total={pagedNotifications?.totalCount ?? 0}
                            showSizeChanger
                            onChange={(page, size) => {
                                setPageNumber(page);
                                setPageSize(size);
                            }}
                            pageSizeOptions={['10', '20', '50', '100']}
                        />
                    </div>
                </Card>
            </motion.div>

            <Drawer
                title={selectedNotification?.title || 'Chi tiết thông báo'}
                width={560}
                open={!!selectedNotification}
                onClose={() => setSelectedNotification(null)}
                extra={
                    selectedNotification ? (
                        <Button
                            icon={<EditOutlined />}
                            onClick={() => {
                                openEditModal(selectedNotification);
                            }}
                        >
                            Sửa nhanh
                        </Button>
                    ) : null
                }
            >
                {selectedNotification ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div
                            style={{
                                border: '1px solid #dbeafe',
                                borderRadius: 12,
                                padding: 14,
                                background: '#f0f7ff',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <Tag style={{ margin: 0 }}>{selectedNotification.userRole}</Tag>
                                <Tag style={{ margin: 0, borderColor: '#bae6fd', color: '#0369a1' }}>
                                    {formatDateTimeToMinute(selectedNotification.createdAt) || 'N/A'}
                                </Tag>
                            </div>
                            <div style={{ marginTop: 10, color: '#334155' }}>
                                Người nhận: <b>{selectedNotification.userDisplayName}</b> ({selectedNotification.userEmail})
                            </div>
                        </div>

                        <Card title="Nội dung thông báo" styles={{ header: { borderBottom: '1px solid #f1f5f9' } }}>
                            <div style={{ whiteSpace: 'pre-wrap', color: '#1e293b', lineHeight: 1.68 }}>
                                {selectedNotification.message || 'Không có nội dung chi tiết.'}
                            </div>
                        </Card>
                    </div>
                ) : null}
            </Drawer>

            <Modal
                title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <SendHorizontal size={16} />
                        <span>{editorMode === 'create' ? 'Tạo thông báo hệ thống' : 'Chỉnh sửa thông báo'}</span>
                    </div>
                }
                open={isEditorModalOpen}
                onCancel={closeEditorModal}
                onOk={handleSubmitEditor}
                okText={editorMode === 'create' ? 'Gửi thông báo' : 'Lưu thay đổi'}
                cancelText="Hủy"
                confirmLoading={isSavingEditor}
                destroyOnClose
            >
                <Form
                    layout="vertical"
                    form={form}
                    preserve={false}
                    initialValues={defaultFormValues}
                    style={{ marginTop: 12 }}
                >
                    <Form.Item
                        label="Vai trò nhận"
                        name="targetRole"
                        rules={[{ required: true, message: 'Vui lòng chọn vai trò nhận.' }]}
                    >
                        <Select
                            size="large"
                            options={roleOptions}
                            disabled={editorMode === 'edit'}
                            style={{ borderRadius: 10 }}
                        />
                    </Form.Item>

                    <Form.Item
                        label="Tiêu đề thông báo"
                        name="title"
                        rules={[
                            { required: true, message: 'Vui lòng nhập tiêu đề thông báo.' },
                            { max: 255, message: 'Tiêu đề tối đa 255 ký tự.' },
                        ]}
                    >
                        <Input size="large" maxLength={255} showCount placeholder="Ví dụ: Cập nhật lịch thi tháng này" />
                    </Form.Item>

                    <Form.Item
                        label="Nội dung thông báo"
                        name="message"
                        rules={[{ max: 2000, message: 'Nội dung tối đa 2000 ký tự.' }]}
                    >
                        <Input.TextArea
                            rows={6}
                            showCount
                            maxLength={2000}
                            placeholder="Nhập nội dung chi tiết gửi đến học viên / quản trị viên..."
                            style={{ borderRadius: 10 }}
                        />
                    </Form.Item>

                    {editorMode === 'edit' ? (
                        <div
                            style={{
                                border: '1px dashed #cbd5e1',
                                borderRadius: 10,
                                padding: '8px 10px',
                                color: '#64748b',
                                fontSize: '0.82rem',
                            }}
                        >
                            Vai trò nhận đang được giữ nguyên khi chỉnh sửa để tránh thay đổi nhầm phạm vi đã gửi.
                        </div>
                    ) : null}
                </Form>
            </Modal>
        </motion.div>
    );
};
