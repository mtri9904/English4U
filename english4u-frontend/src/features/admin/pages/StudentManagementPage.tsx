import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
    Avatar,
    Badge,
    Button,
    Card,
    Drawer,
    Input,
    Select,
    Space,
    Table,
    Tag,
    Tooltip,
    message,
    Spin,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
    DeleteOutlined,
    EyeOutlined,
    SearchOutlined,
    SafetyCertificateOutlined,
    SyncOutlined,
    TrophyOutlined,
    UserOutlined,
} from '@ant-design/icons';
import { Activity, Crown, Sparkles, Users } from 'lucide-react';
import {
    useAdminStatsQuery,
    useAdminUsersQuery,
    useAdminUserDetailQuery,
    useToggleUserStatusMutation,
    useDeleteAdminUserMutation,
    useUpdateUserRoleMutation,
    type UserOverviewDto
} from '@/features/admin/api/user.api';
import { Modal } from 'antd';
import { formatDateTimeToMinute } from '@/shared/lib/dateTime';

const { confirm } = Modal;

const planConfig: Record<string, { bg: string; color: string }> = {
    Free: { bg: '#f1f5f9', color: '#475569' },
    Pro: { bg: '#dbeafe', color: '#1d4ed8' },
    Premium: { bg: '#fef3c7', color: '#92400e' },
};

const scoreColor = (score: number) => {
    if (score >= 8.0) return '#16a34a';
    if (score >= 6.5) return '#0ea5e9';
    return '#f59e0b';
};

const roleVisualMap: Record<string, { label: string; bg: string; color: string; border: string }> = {
    Student: { label: 'Học viên', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
    Admin: { label: 'Quản trị', bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
    Teacher: { label: 'Giáo viên', bg: '#ecfeff', color: '#0e7490', border: '#a5f3fc' },
    ContentCreator: { label: 'Sáng tạo nội dung', bg: '#f5f3ff', color: '#6d28d9', border: '#ddd6fe' },
};

const getRoleVisual = (role: string) =>
    roleVisualMap[role] || { label: role || 'Người dùng', bg: '#f8fafc', color: '#334155', border: '#cbd5e1' };

const roleOptions = ['Student', 'Admin', 'Teacher', 'ContentCreator'].map((role) => {
    const visual = getRoleVisual(role);
    return {
        value: role,
        label: (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span
                    style={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        background: visual.color,
                        flexShrink: 0,
                    }}
                />
                <span style={{ color: '#0f172a', fontWeight: 600 }}>{visual.label}</span>
            </span>
        ),
    };
});

const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.08 },
    },
};

const itemVariants = {
    hidden: { opacity: 0, y: 14 },
    visible: { opacity: 1, y: 0 },
};

export const StudentManagementPage = () => {
    const [searchText, setSearchText] = useState('');
    const [statusFilter, setStatusFilter] = useState<boolean | 'ALL'>('ALL');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

    const queryParams = useMemo(() => ({
        pageNumber: page,
        pageSize,
        searchTerm: searchText,
        isActive: statusFilter === 'ALL' ? undefined : statusFilter,
    }), [page, pageSize, searchText, statusFilter]);

    // Queries
    const { data: stats, isLoading: isStatsLoading } = useAdminStatsQuery({
        refetchOnWindowFocus: false,
    });
    const { data: pagedData, isLoading: isTableLoading } = useAdminUsersQuery(queryParams, {
        refetchOnWindowFocus: false,
    });
    const { data: selectedStudent, isLoading: isDetailLoading } = useAdminUserDetailQuery(
        selectedStudentId || '',
        !!selectedStudentId,
        {
            refetchOnWindowFocus: false,
        },
    );
    const toggleStatusMutation = useToggleUserStatusMutation();
    const deleteMutation = useDeleteAdminUserMutation();
    const updateUserRoleMutation = useUpdateUserRoleMutation();

    const handleToggleStatus = async (id: string, currentStatus: boolean) => {
        try {
            await toggleStatusMutation.mutateAsync({ id, isActive: !currentStatus });
            message.success('Đã cập nhật trạng thái học viên');
        } catch {
            message.error('Cập nhật thất bại');
        }
    };

    const handleDeleteUser = (id: string, email: string) => {
        confirm({
            title: 'Xóa tài khoản học viên',
            content: `Bạn có chắc chắn muốn xóa vĩnh viễn tài khoản ${email}? Hành động này không thể hoàn tác.`,
            okText: 'Xóa ngay',
            okType: 'danger',
            cancelText: 'Hủy',
            onOk: async () => {
                try {
                    await deleteMutation.mutateAsync(id);
                    message.success('Đã xóa tài khoản thành công');
                } catch {
                    message.error('Xóa tài khoản thất bại');
                }
            },
        });
    };

    const columns: ColumnsType<UserOverviewDto> = [
        {
            title: 'Học viên',
            key: 'student',
            render: (_, record) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Avatar
                        size={42}
                        src={record.avatarUrl}
                        style={{
                            background: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)',
                            fontWeight: 700,
                        }}
                    >
                        {record.displayName?.charAt(0) || record.email.charAt(0).toUpperCase()}
                    </Avatar>
                    <div>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{record.displayName || 'Chưa đặt tên'}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{record.email}</div>
                    </div>
                </div>
            ),
        },
        {
            title: 'Trình độ',
            dataIndex: 'currentLevel',
            key: 'level',
            width: 100,
            onCell: () => ({ style: { whiteSpace: 'nowrap' } }),
            onHeaderCell: () => ({ style: { whiteSpace: 'nowrap' } }),
            render: (level: string) => (
                <Tag color="blue" style={{ borderRadius: '999px', fontWeight: 600, margin: 0 }}>
                    {level || 'N/A'}
                </Tag>
            ),
        },
        {
            title: 'Gói',
            dataIndex: 'subscriptionName',
            key: 'plan',
            width: 100,
            onCell: () => ({ style: { whiteSpace: 'nowrap' } }),
            onHeaderCell: () => ({ style: { whiteSpace: 'nowrap' } }),
            render: (plan: string) => (
                <span
                    style={{
                        padding: '4px 10px',
                        borderRadius: '999px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        background: planConfig[plan]?.bg || '#f1f5f9',
                        color: planConfig[plan]?.color || '#475569',
                    }}
                >
                    {plan || 'Free'}
                </span>
            ),
        },
        {
            title: 'Vai trò',
            dataIndex: 'roleName',
            key: 'role',
            width: 160,
            onCell: () => ({ style: { whiteSpace: 'nowrap' } }),
            onHeaderCell: () => ({ style: { whiteSpace: 'nowrap' } }),
            render: (role: string, record) => (
                (() => {
                    const visual = getRoleVisual(role);
                    return (
                        <div
                            style={{
                                borderRadius: 999,
                                border: `1px solid ${visual.border}`,
                                background: visual.bg,
                                padding: '2px 8px',
                                minWidth: 132,
                            }}
                        >
                            <Select
                                value={role}
                                style={{ width: '100%' }}
                                onChange={async (newRole) => {
                                    try {
                                        await updateUserRoleMutation.mutateAsync({ id: record.id, roleName: newRole });
                                        message.success(`Đã cập nhật vai trò: ${getRoleVisual(newRole).label}`);
                                    } catch {
                                        message.error('Cập nhật vai trò thất bại');
                                    }
                                }}
                                loading={updateUserRoleMutation.isPending && updateUserRoleMutation.variables?.id === record.id}
                                options={roleOptions}
                                variant="borderless"
                                suffixIcon={<SafetyCertificateOutlined style={{ color: visual.color }} />}
                            />
                        </div>
                    );
                })()
            ),
        },
        {
            title: 'Trạng thái',
            key: 'status',
            width: 180,
            onCell: () => ({ style: { whiteSpace: 'nowrap' } }),
            onHeaderCell: () => ({ style: { whiteSpace: 'nowrap' } }),
            render: (_, record) => {
                if (!record.isActive) {
                    return <Badge color="#ef4444" text="Đã khóa" />;
                }

                return (
                    <Badge
                        color={record.isOnline ? '#16a34a' : '#64748b'}
                        text={record.isOnline ? 'Đang hoạt động' : 'Không hoạt động'}
                    />
                );
            },
        },
        {
            title: 'Điểm TB',
            key: 'avgScore',
            width: 140,
            onCell: () => ({ style: { whiteSpace: 'nowrap' } }),
            onHeaderCell: () => ({ style: { whiteSpace: 'nowrap' } }),
            render: (_, record) => (
                <div>
                    <div style={{ fontWeight: 700, fontSize: '0.8125rem', color: scoreColor(record.averageScore) }}>
                        {record.averageScore > 0 ? `${record.averageScore.toFixed(1)} Band` : 'Chưa có điểm'}
                    </div>
                </div>
            ),
        },
        {
            title: 'Lần cuối hoạt động',
            dataIndex: 'lastSeenAt',
            key: 'lastActiveAt',
            width: 200,
            onCell: () => ({ style: { whiteSpace: 'nowrap' } }),
            onHeaderCell: () => ({ style: { whiteSpace: 'nowrap' } }),
            render: (value: string | null) => (
                <span style={{ color: '#475569', fontSize: '0.8125rem' }}>
                    {formatDateTimeToMinute(value) || 'Chưa có dữ liệu'}
                </span>
            ),
        },
        {
            title: 'Thao tác',
            key: 'action',
            width: 140,
            onCell: () => ({ style: { whiteSpace: 'nowrap' } }),
            onHeaderCell: () => ({ style: { whiteSpace: 'nowrap' } }),
            render: (_, record) => (
                <Space>
                    <Tooltip title="Xem nhanh">
                        <Button
                            type="text"
                            icon={<EyeOutlined />}
                            onClick={() => setSelectedStudentId(record.id)}
                            style={{ color: '#0ea5e9' }}
                        />
                    </Tooltip>
                    <Tooltip title={record.isActive ? 'Khóa tài khoản' : 'Kích hoạt'}>
                        <Button
                            type="text"
                            icon={<SyncOutlined spin={toggleStatusMutation.isPending} />}
                            onClick={() => handleToggleStatus(record.id, record.isActive)}
                            style={{ color: record.isActive ? '#ef4444' : '#16a34a' }}
                        />
                    </Tooltip>
                    <Tooltip title="Xóa tài khoản">
                        <Button
                            type="text"
                            icon={<DeleteOutlined />}
                            onClick={() => handleDeleteUser(record.id, record.email)}
                            danger
                        />
                    </Tooltip>
                </Space>
            ),
        },
    ];

    const statCards = [
        {
            title: 'Tổng học viên',
            value: stats?.totalUsers || 0,
            icon: Users,
            accent: 'linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)',
        },
        {
            title: 'Tài khoản mở',
            value: stats?.activeUsers || 0,
            icon: Activity,
            accent: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        },
        {
            title: 'Đang online',
            value: stats?.onlineUsers || 0,
            icon: Sparkles,
            accent: 'linear-gradient(135deg, #22d3ee 0%, #2563eb 100%)',
        },
        {
            title: 'Điểm trung bình',
            value: stats?.globalAverageScore ? `${stats.globalAverageScore.toFixed(1)}` : '0.0',
            icon: TrophyOutlined,
            accent: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)',
        },
        {
            title: 'Premium',
            value: stats?.premiumUsers || 0,
            icon: Crown,
            accent: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
        },
    ];

    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
        >
            <motion.div variants={itemVariants}>
                <div
                    style={{
                        borderRadius: '18px',
                        padding: '22px',
                        background: 'radial-gradient(circle at 0% 0%, #1d4ed8 0%, #0f172a 75%)',
                        border: '1px solid rgba(148, 163, 184, 0.25)',
                        color: '#fff',
                        position: 'relative',
                        overflow: 'hidden',
                    }}
                >
                    <div style={{ position: 'absolute', width: 180, height: 180, borderRadius: '999px', background: 'rgba(14, 165, 233, 0.25)', right: -60, top: -40 }} />
                    <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                        <div>
                            <div style={{ fontSize: '1.55rem', fontWeight: 800, letterSpacing: '0.01em', marginBottom: '6px' }}>Quản Lý Học Viên</div>
                            <div style={{ color: 'rgba(226, 232, 240, 0.95)' }}>
                                Theo dõi tiến độ, trạng thái học tập và chất lượng đầu ra của từng học viên.
                            </div>
                        </div>
                    </div>
                    <div style={{ position: 'relative', zIndex: 1, marginTop: '10px', fontSize: '0.75rem', color: 'rgba(226, 232, 240, 0.92)' }}>
                        Trạng thái online tự cập nhật realtime qua WebSocket
                    </div>
                </div>
            </motion.div>

            <motion.div variants={itemVariants} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                {statCards.map((card) => (
                    <Card key={card.title} loading={isStatsLoading} styles={{ body: { padding: '16px' } }} style={{ borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                            <div>
                                <div style={{ color: '#64748b', fontSize: '0.8125rem', marginBottom: '4px' }}>{card.title}</div>
                                <div style={{ color: '#0f172a', fontWeight: 800, fontSize: '1.6rem', lineHeight: 1.1 }}>{card.value}</div>
                            </div>
                            <div
                                style={{
                                    width: 42,
                                    height: 42,
                                    borderRadius: '12px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: card.accent,
                                    color: '#fff',
                                }}
                            >
                                {(() => {
                                    const Icon = card.icon as any;
                                    return <Icon size={20} style={{ fontSize: 20 }} />;
                                })()}
                            </div>
                        </div>
                    </Card>
                ))}
            </motion.div>

            <motion.div variants={itemVariants}>
                <Card
                    styles={{ body: { padding: '14px' } }}
                    style={{ borderRadius: '14px', border: '1px solid #e2e8f0' }}
                >
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <Input
                            value={searchText}
                            onChange={(event) => setSearchText(event.target.value)}
                            size="large"
                            allowClear
                            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                            placeholder="Tìm theo tên, email hoặc số điện thoại..."
                            style={{ minWidth: 260, flex: 2, borderRadius: '10px', height: 40 }}
                        />
                        <Select
                            value={statusFilter}
                            onChange={(value) => setStatusFilter(value)}
                            size="large"
                            style={{ minWidth: 220, flex: 1, height: 40 }}
                            options={[
                                { label: 'Tất cả trạng thái', value: 'ALL' },
                                { label: 'Đang mở tài khoản', value: true },
                                { label: 'Đã khóa tài khoản', value: false },
                            ]}
                        />
                        <Button
                            icon={<SyncOutlined />}
                            onClick={() => {
                                setSearchText('');
                                setStatusFilter('ALL');
                                setPage(1);
                            }}
                            style={{ borderRadius: '10px', height: 40 }}
                        >
                            Xóa lọc
                        </Button>
                    </div>
                </Card>
            </motion.div>

            <motion.div variants={itemVariants}>
                <Card styles={{ body: { padding: 0 } }} style={{ borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                    <Table
                        columns={columns}
                        dataSource={pagedData?.items || []}
                        loading={isTableLoading}
                        rowKey="id"
                        pagination={{
                            current: page,
                            pageSize: pageSize,
                            total: pagedData?.totalCount || 0,
                            onChange: (p, s) => {
                                setPage(p);
                                setPageSize(s);
                            },
                            showSizeChanger: true,
                            pageSizeOptions: ['10', '20', '50', '100']
                        }}
                        scroll={{ x: 'max-content' }}
                    />
                </Card>
            </motion.div>

            <Drawer
                title={selectedStudent?.displayName || selectedStudent?.email || 'Chi tiết học viên'}
                open={!!selectedStudentId}
                width={460}
                onClose={() => setSelectedStudentId(null)}
            >
                {isDetailLoading ? <Spin /> : selectedStudent && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <div
                            style={{
                                padding: '14px',
                                borderRadius: '12px',
                                border: '1px solid #dbeafe',
                                background: 'linear-gradient(135deg, #eff6ff 0%, #f8fbff 100%)',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                                <Avatar
                                    size={50}
                                    src={selectedStudent.avatarUrl}
                                    icon={<UserOutlined />}
                                    style={{ background: '#2563eb' }}
                                />
                                <div>
                                    <div style={{ fontWeight: 800, color: '#0f172a' }}>{selectedStudent.displayName || 'Chưa có tên'}</div>
                                    <div style={{ color: '#475569', fontSize: '0.8125rem' }}>{selectedStudent.email}</div>
                                </div>
                            </div>
                            <Space wrap>
                                <Tag color="blue" style={{ borderRadius: '999px' }}>{selectedStudent.currentLevel || 'N/A'}</Tag>
                                <Tag style={{ background: planConfig[selectedStudent.subscriptionName || 'Free']?.bg, color: planConfig[selectedStudent.subscriptionName || 'Free']?.color, border: 'none', borderRadius: '999px' }}>
                                    {selectedStudent.subscriptionName || 'Free'}
                                </Tag>
                                {!selectedStudent.isActive
                                    ? <Badge color="#ef4444" text="Đã khóa" />
                                    : <Badge color={selectedStudent.isOnline ? '#16a34a' : '#64748b'} text={selectedStudent.isOnline ? 'Đang hoạt động' : 'Không hoạt động'} />}
                            </Space>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <Card size="small" title="Số bài thi">{selectedStudent.totalExamsTaken}</Card>
                            <Card size="small" title="Điểm trung bình">{selectedStudent.averageScore?.toFixed(1) || 0} Band</Card>
                            <Card size="small" title="Vai trò">
                                {(() => {
                                    const visual = getRoleVisual(selectedStudent.roleName);
                                    return (
                                        <Tag
                                            style={{
                                                margin: 0,
                                                borderRadius: 999,
                                                border: `1px solid ${visual.border}`,
                                                background: visual.bg,
                                                color: visual.color,
                                                fontWeight: 700,
                                                paddingInline: 10,
                                            }}
                                        >
                                            {visual.label}
                                        </Tag>
                                    );
                                })()}
                            </Card>
                            <Card size="small" title="SDT">{selectedStudent.phone || 'N/A'}</Card>
                        </div>

                        {selectedStudent.recentSessions && selectedStudent.recentSessions.length > 0 && (
                            <Card size="small" title="Lịch sử thi gần đây">
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {selectedStudent.recentSessions.map(session => (
                                        <div key={session.sessionId} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: '0.8125rem' }}>{session.examTitle}</div>
                                                <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                                                    {formatDateTimeToMinute(session.completedAt) || 'N/A'}
                                                </div>
                                            </div>
                                            <Tag color={scoreColor(session.score)} style={{ height: 'fit-content' }}>{session.score} Band</Tag>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        )}

                        <Card size="small" title="Thông tin cá nhân">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: '#334155' }}>
                                <div><b>Phòng ban:</b> {selectedStudent.department || 'N/A'}</div>
                                <div><b>Vị trí:</b> {selectedStudent.position || 'N/A'}</div>
                                <div><b>Ghi chú:</b> {selectedStudent.notes || 'N/A'}</div>
                            </div>
                        </Card>

                        <Card size="small" title="Mốc thời gian">
                            <div style={{ color: '#334155', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div>Tham gia: <b>{formatDateTimeToMinute(selectedStudent.createdAt) || 'N/A'}</b></div>
                                <div>Đăng nhập gần nhất: <b>{formatDateTimeToMinute(selectedStudent.lastLoginAt) || 'N/A'}</b></div>
                                <div>Hoạt động gần nhất: <b>{formatDateTimeToMinute(selectedStudent.lastSeenAt) || 'N/A'}</b></div>
                            </div>
                        </Card>
                    </div>
                )}
            </Drawer>
        </motion.div>
    );
};
