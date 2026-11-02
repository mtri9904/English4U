import type { ColumnsType } from 'antd/es/table';
import { Avatar, Badge, Button, Select, Space, Tooltip } from 'antd';
import {
    DeleteOutlined,
    EyeOutlined,
    SafetyCertificateOutlined,
    SyncOutlined,
} from '@ant-design/icons';
import { formatDateTimeToMinute } from '@/shared/lib/dateTime';
import type { UserOverviewDto } from '../types/student.types';
import { getRoleVisual, scoreColor } from '../utils/student.utils';

export const studentRoleOptions = ['Student', 'Admin', 'Teacher', 'ContentCreator'].map((role) => {
    const visual = getRoleVisual(role);
    return {
        value: role,
        label: visual.label,
    };
});

export interface CreateStudentColumnsOptions {
    onViewQuick: (id: string) => void;
    onToggleStatus: (id: string, isActive: boolean) => void;
    onDelete: (id: string, email: string) => void;
    onUpdateRole: (id: string, newRole: string) => void;
    isRoleUpdating: (id: string) => boolean;
    isToggleUpdating: boolean;
}

export const createStudentColumns = ({
    onViewQuick,
    onToggleStatus,
    onDelete,
    onUpdateRole,
    isRoleUpdating,
    isToggleUpdating,
}: CreateStudentColumnsOptions): ColumnsType<UserOverviewDto> => [
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
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>
                        {record.displayName || 'Chưa đặt tên'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{record.email}</div>
                </div>
            </div>
        ),
    },
    {
        title: 'Vai trò',
        dataIndex: 'roleName',
        key: 'role',
        width: 160,
        onCell: () => ({ style: { whiteSpace: 'nowrap' } }),
        onHeaderCell: () => ({ style: { whiteSpace: 'nowrap' } }),
        render: (role: string, record) => {
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
                        onChange={(newRole) => onUpdateRole(record.id, newRole)}
                        loading={isRoleUpdating(record.id)}
                        options={studentRoleOptions}
                        variant="borderless"
                        suffixIcon={<SafetyCertificateOutlined style={{ color: visual.color }} />}
                    />
                </div>
            );
        },
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
                <div
                    style={{
                        fontWeight: 700,
                        fontSize: '0.8125rem',
                        color: scoreColor(record.averageScore),
                    }}
                >
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
                        onClick={() => onViewQuick(record.id)}
                        style={{ color: '#0ea5e9' }}
                    />
                </Tooltip>
                <Tooltip title={record.isActive ? 'Khóa tài khoản' : 'Kích hoạt'}>
                    <Button
                        type="text"
                        icon={<SyncOutlined spin={isToggleUpdating} />}
                        onClick={() => onToggleStatus(record.id, record.isActive)}
                        style={{ color: record.isActive ? '#ef4444' : '#16a34a' }}
                    />
                </Tooltip>
                <Tooltip title="Xóa tài khoản">
                    <Button
                        type="text"
                        icon={<DeleteOutlined />}
                        onClick={() => onDelete(record.id, record.email)}
                        danger
                    />
                </Tooltip>
            </Space>
        ),
    },
];

