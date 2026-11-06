import { useMemo, useState, useCallback } from 'react';
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
    message,
    Spin,
} from 'antd';
import {
    SearchOutlined,
    SyncOutlined,
    TrophyOutlined,
    UserOutlined,
} from '@ant-design/icons';
import { Activity, Crown, Sparkles, Users } from 'lucide-react';
import { createTablePagination } from '@/components/AppPagination';
import {
    useAdminStatsQuery,
    useAdminUsersQuery,
    useAdminUserDetailQuery,
    useToggleUserStatusMutation,
    useDeleteAdminUserMutation,
    useUpdateUserRoleMutation,
} from '@/features/students';
import { Modal } from 'antd';
import { formatDateTimeToMinute } from '@/shared/lib/dateTime';
import { useUrlFilters } from '@/shared/hooks';

const { confirm } = Modal;

import { scoreColor, getRoleVisual } from '../utils/student.utils';
import { createStudentColumns } from '../configs/student.columns';

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

interface StudentUrlFilters {
    search: string;
    status: 'ALL' | 'ACTIVE' | 'LOCKED';
    page: number;
    pageSize: number;
}

const DEFAULT_STUDENT_FILTERS: StudentUrlFilters = {
    search: '',
    status: 'ALL',
    page: 1,
    pageSize: 10,
};

export const StudentManagementPage = () => {
    const {
        filters,
        getSearchInputValue,
        setFilter,
        setFilters,
        resetFilters,
    } = useUrlFilters<StudentUrlFilters>({
        defaultValues: DEFAULT_STUDENT_FILTERS,
        pageKey: 'page',
    });

    const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

    const queryParams = useMemo(() => ({
        pageNumber: filters.page,
        pageSize: filters.pageSize,
        searchTerm: filters.search.trim() || undefined,
        search: filters.search.trim() || undefined,
        isActive: filters.status === 'ALL' ? undefined : filters.status === 'ACTIVE',
    }), [filters]);


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

    const handleToggleStatus = useCallback(async (id: string, currentStatus: boolean) => {
        try {
            await toggleStatusMutation.mutateAsync({ id, payload: { isLocked: currentStatus } });
            message.success('Đã cập nhật trạng thái học viên');
        } catch {
            message.error('Cập nhật thất bại');
        }
    }, [toggleStatusMutation]);

    const handleDeleteUser = useCallback((id: string, email: string) => {
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
    }, [deleteMutation]);

    const handleUpdateRole = useCallback(async (id: string, newRole: string) => {
        try {
            await updateUserRoleMutation.mutateAsync({ id, payload: { role: newRole } });
            message.success(`Đã cập nhật vai trò: ${getRoleVisual(newRole).label}`);
        } catch {
            message.error('Cập nhật vai trò thất bại');
        }
    }, [updateUserRoleMutation]);

    const columns = useMemo(
        () =>
            createStudentColumns({
                onViewQuick: setSelectedStudentId,
                onToggleStatus: handleToggleStatus,
                onDelete: handleDeleteUser,
                onUpdateRole: handleUpdateRole,
                isRoleUpdating: (id) =>
                    updateUserRoleMutation.isPending &&
                    updateUserRoleMutation.variables?.id === id,
                isToggleUpdating: toggleStatusMutation.isPending,
            }),
        [
            updateUserRoleMutation.isPending,
            updateUserRoleMutation.variables,
            toggleStatusMutation.isPending,
            handleToggleStatus,
            handleDeleteUser,
            handleUpdateRole,
        ]
    );

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
                            value={getSearchInputValue('search')}
                            onChange={(event) => setFilter('search', event.target.value)}
                            size="large"
                            allowClear
                            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                            placeholder="Tìm theo tên, email hoặc số điện thoại..."
                            style={{ minWidth: 260, flex: 2, borderRadius: '10px', height: 40 }}
                        />
                        <Select
                            value={filters.status}
                            onChange={(value) => setFilter('status', value)}
                            size="large"
                            style={{ minWidth: 220, flex: 1, height: 40 }}
                            options={[
                                { label: 'Tất cả trạng thái', value: 'ALL' },
                                { label: 'Đang mở tài khoản', value: 'ACTIVE' },
                                { label: 'Đã khóa tài khoản', value: 'LOCKED' },
                            ]}
                        />
                        <Button
                            icon={<SyncOutlined />}
                            onClick={resetFilters}
                            style={{ borderRadius: '10px', height: 40 }}
                        >
                            Xóa lọc
                        </Button>
                    </div>
                </Card>
            </motion.div>

            <motion.div variants={itemVariants}>
                <Card styles={{ body: { padding: '16px 20px 20px 20px' } }} style={{ borderRadius: '14px', border: '1px solid #e2e8f0', background: '#fff' }}>
                    <Table
                        columns={columns}
                        dataSource={pagedData?.items || []}
                        loading={isTableLoading}
                        rowKey="id"
                        pagination={createTablePagination({
                            current: filters.page,
                            pageSize: filters.pageSize,
                            total: pagedData?.totalCount || 0,
                            onChange: (p, s) => {
                                setFilters({ page: p, pageSize: s });
                            },
                            entityLabel: 'học viên',
                        })}
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
