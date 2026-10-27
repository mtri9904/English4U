import type { ColumnsType } from 'antd/es/table';
import { Button, Space, Switch, Tag, Tooltip } from 'antd';
import {
    DeleteOutlined,
    EditOutlined,
    EyeOutlined,
} from '@ant-design/icons';
import type { ExamDto } from '@/features/exams/types/exam.types';
import { examTypeColorMap, skillColors } from '../../constants/exam.constants';
import { getPrimarySkill } from '../../utils/exam.utils';

const iconButtonStyle = {
    borderRadius: 10,
    width: 34,
    height: 34,
    border: '1px solid #e2e8f0',
    background: '#fff',
};

interface CreateExamColumnsOptions {
    onView: (id: string) => void;
    onEdit: (id: string) => void;
    onDelete: (exam: ExamDto) => void;
    onToggleStatus: (id: string, isPublished: boolean) => void;
    isStatusUpdating: (id: string) => boolean;
    isDeleting: (id: string) => boolean;
}

export const createExamColumns = ({
    onView,
    onEdit,
    onDelete,
    onToggleStatus,
    isStatusUpdating,
    isDeleting,
}: CreateExamColumnsOptions): ColumnsType<ExamDto> => [
    {
        title: 'Tên đề thi',
        dataIndex: 'title',
        key: 'title',
        width: 360,
        render: (_: string, record) => (
            <div style={{ minWidth: 280 }}>
                <div style={{ fontWeight: 700, color: '#0f172a' }}>{record.title}</div>
                <div
                    style={{
                        marginTop: 3,
                        color: '#64748b',
                        fontSize: '0.78rem',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: 350,
                    }}
                >
                    {record.description?.trim() || 'Chưa có mô tả đề thi.'}
                </div>
            </div>
        ),
    },
    {
        title: 'Loại',
        dataIndex: 'examType',
        key: 'examType',
        width: 120,
        render: (type: string | null) => {
            const style = (type && examTypeColorMap[type]) || { bg: '#f1f5f9', color: '#475569' };
            return (
                <Tag
                    style={{
                        background: style.bg,
                        color: style.color,
                        border: 'none',
                        borderRadius: 999,
                        padding: '2px 12px',
                        fontWeight: 700,
                    }}
                >
                    {type || 'N/A'}
                </Tag>
            );
        },
    },
    {
        title: 'Kỹ năng',
        key: 'skills',
        width: 150,
        render: (_, record: ExamDto) => {
            const skill = getPrimarySkill(record);

            if (!skill) {
                return <Tag style={{ borderRadius: 8, color: '#64748b' }}>Chưa có</Tag>;
            }

            return (
                <Tag
                    color={skillColors[skill] || 'default'}
                    style={{ borderRadius: 8, margin: 0, fontWeight: 700 }}
                >
                    {skill}
                </Tag>
            );
        },
    },
    {
        title: 'Thời gian',
        dataIndex: 'durationMinutes',
        key: 'durationMinutes',
        width: 115,
        render: (value: number | null) => (
            <span style={{ color: '#475569' }}>{value ? `${value} phút` : '—'}</span>
        ),
    },
    {
        title: 'Trạng thái',
        dataIndex: 'isPublished',
        key: 'isPublished',
        width: 195,
        render: (published: boolean, record: ExamDto) => (
            <Switch
                checked={published}
                checkedChildren="Xuất bản"
                unCheckedChildren="Nháp"
                onChange={(checked) => onToggleStatus(record.id, checked)}
                loading={isStatusUpdating(record.id)}
            />
        ),
    },
    {
        title: 'Ngày tạo',
        dataIndex: 'createdAt',
        key: 'createdAt',
        width: 130,
        render: (date: string) => (
            <span style={{ color: '#64748b', fontSize: '0.8125rem' }}>
                {new Date(date).toLocaleDateString('vi-VN')}
            </span>
        ),
    },
    {
        title: 'Thao tác',
        key: 'actions',
        width: 140,
        render: (_: unknown, record: ExamDto) => (
            <Space size={8}>
                <Tooltip title="Xem chi tiết">
                    <Button
                        icon={<EyeOutlined />}
                        onClick={() => onView(record.id)}
                        style={{ ...iconButtonStyle, color: '#0ea5e9' }}
                    />
                </Tooltip>
                <Tooltip title="Chỉnh sửa">
                    <Button
                        icon={<EditOutlined />}
                        onClick={() => onEdit(record.id)}
                        style={{ ...iconButtonStyle, color: '#f59e0b' }}
                    />
                </Tooltip>
                <Tooltip title="Xóa">
                    <Button
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => onDelete(record)}
                        loading={isDeleting(record.id)}
                        style={iconButtonStyle}
                    />
                </Tooltip>
            </Space>
        ),
    },
];

