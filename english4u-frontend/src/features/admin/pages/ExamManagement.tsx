import { useState } from 'react';
import { motion } from 'framer-motion';
import { Table, Button, Tag, Modal, Input, Select, Space, message, Tooltip, Empty, Switch } from 'antd';
import {
    PlusOutlined,
    SearchOutlined,
    DeleteOutlined,
    EyeOutlined,
    EditOutlined,
    CloudUploadOutlined,
    ExclamationCircleFilled,
    FileTextOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import { useExamsQuery, useDeleteExamMutation, useUpdateExamStatusMutation } from '../api/exam.api';
import type { ExamDto } from '../types/exam.types';
import { UploadPdfModal } from '../components/UploadPdfModal';

const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0 },
};

export const ExamManagement = () => {
    const navigate = useNavigate();
    const [searchText, setSearchText] = useState('');
    const [filterType, setFilterType] = useState<string | null>(null);
    const [isUploadOpen, setIsUploadOpen] = useState(false);

    const { data: exams = [], isLoading } = useExamsQuery();
    const deleteMutation = useDeleteExamMutation();
    const updateStatusMutation = useUpdateExamStatusMutation();

    const handleEdit = (id: string) => {
        navigate(`/admin/exams/edit/${id}`);
    };

    const handleToggleStatus = (id: string, isPublished: boolean) => {
        updateStatusMutation.mutate({ id, isPublished }, {
            onSuccess: () => message.success('Cập nhật trạng thái thành công!'),
            onError: () => message.error('Cập nhật trạng thái thất bại!'),
        });
    };

    const filteredExams = exams.filter(exam => {
        const matchSearch = exam.title.toLowerCase().includes(searchText.toLowerCase());
        const matchType = !filterType || exam.examType === filterType;
        return matchSearch && matchType;
    });

    const handleDelete = (exam: ExamDto) => {
        Modal.confirm({
            title: 'Xác nhận xóa đề thi',
            icon: <ExclamationCircleFilled />,
            content: (
                <span>
                    Bạn có chắc muốn xóa <strong>{exam.title}</strong>? Hành động này không thể hoàn tác.
                </span>
            ),
            okText: 'Xóa',
            okType: 'danger',
            cancelText: 'Hủy',
            onOk: () =>
                deleteMutation.mutateAsync(exam.id).then(() => {
                    message.success('Đã xóa đề thi thành công!');
                }),
        });
    };

    const columns: ColumnsType<ExamDto> = [
        {
            title: 'Tên đề thi',
            dataIndex: 'title',
            key: 'title',
            render: (text: string) => (
                <span style={{ fontWeight: 600, color: '#0f172a' }}>{text}</span>
            ),
        },
        {
            title: 'Loại',
            dataIndex: 'examType',
            key: 'examType',
            width: 120,
            render: (type: string) => {
                const colorMap: Record<string, { bg: string; color: string }> = {
                    IELTS: { bg: '#ede9fe', color: '#7c3aed' },
                    TOEIC: { bg: '#dbeafe', color: '#2563eb' },
                };
                const style = colorMap[type] || { bg: '#f1f5f9', color: '#475569' };
                return (
                    <Tag style={{ background: style.bg, color: style.color, border: 'none', fontWeight: 600, borderRadius: '8px', padding: '2px 12px' }}>
                        {type || 'N/A'}
                    </Tag>
                );
            },
        },
        {
            title: 'Kỹ năng',
            key: 'skills',
            render: (_, record: ExamDto) => {
                const skills = Array.from(new Set(record.skillTypes || []));
                const skillColors: Record<string, string> = {
                    Reading: '#10b981',
                    Listening: '#6366f1',
                    Writing: '#f59e0b',
                    Speaking: '#ef4444',
                };
                return (
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'nowrap' }}>
                        {skills.map(skill => (
                            <Tag key={skill} color={skillColors[skill]} style={{ borderRadius: '6px', margin: 0 }}>
                                {skill}
                            </Tag>
                        ))}
                    </div>
                );
            },
        },
        {
            title: 'Thời gian',
            dataIndex: 'durationMinutes',
            key: 'durationMinutes',
            width: 110,
            render: (val: number | null) => (
                <span style={{ color: '#64748b' }}>{val ? `${val} phút` : '—'}</span>
            ),
        },
        {
            title: 'Tổng điểm',
            dataIndex: 'totalPoints',
            key: 'totalPoints',
            width: 110,
            render: (val: number | null) => (
                <span style={{ fontWeight: 600, color: '#0ea5e9' }}>{val ?? '—'}</span>
            ),
        },
        {
            title: 'Trạng thái',
            dataIndex: 'isPublished',
            key: 'isPublished',
            width: 140,
            render: (published: boolean, record: ExamDto) => (
                <Switch
                    checked={published}
                    checkedChildren="Xuất bản"
                    unCheckedChildren="Nháp"
                    onChange={(checked) => handleToggleStatus(record.id, checked)}
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
                <Space>
                    <Tooltip title="Xem chi tiết">
                        <Button
                            type="text"
                            icon={<EyeOutlined />}
                            onClick={() => navigate(`/admin/exams/${record.id}`)}
                            style={{ color: '#0ea5e9' }}
                        />
                    </Tooltip>
                    <Tooltip title="Chỉnh sửa">
                        <Button
                            type="text"
                            icon={<EditOutlined />}
                            onClick={() => handleEdit(record.id)}
                            style={{ color: '#f59e0b' }}
                        />
                    </Tooltip>
                    <Tooltip title="Xóa">
                        <Button
                            type="text"
                            icon={<DeleteOutlined />}
                            onClick={() => handleDelete(record)}
                            style={{ color: '#ef4444' }}
                        />
                    </Tooltip>
                </Space>
            ),
        },
    ];

    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}
        >
            <motion.div variants={itemVariants} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                    <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                        Quản lý Đề thi
                    </h2>
                    <p style={{ color: '#64748b', marginTop: '4px' }}>
                        Tạo, chỉnh sửa và quản lý tất cả đề thi trong hệ thống
                    </p>
                </div>
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Button
                        icon={<CloudUploadOutlined />}
                        size="large"
                        onClick={() => setIsUploadOpen(true)}
                        style={{
                            background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
                            border: 'none',
                            borderRadius: '12px',
                            height: '44px',
                            fontWeight: 600,
                            color: '#fff',
                            boxShadow: '0 4px 14px rgba(245, 158, 11, 0.3)',
                        }}
                    >
                        AI từ PDF
                    </Button>
                </motion.div>
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        size="large"
                        onClick={() => navigate('/admin/exams/create')}
                        style={{
                            background: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)',
                            border: 'none',
                            borderRadius: '12px',
                            height: '44px',
                            fontWeight: 600,
                            boxShadow: '0 4px 14px rgba(14, 165, 233, 0.3)',
                        }}
                    >
                        Tạo đề thi mới
                    </Button>
                </motion.div>
            </motion.div>

            <motion.div
                variants={itemVariants}
                style={{
                    background: '#fff',
                    borderRadius: '16px',
                    border: '1px solid #f1f5f9',
                    overflow: 'hidden',
                }}
            >
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <Input
                        placeholder="Tìm kiếm đề thi..."
                        prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                        style={{ maxWidth: 320, borderRadius: '10px' }}
                        allowClear
                    />
                    <Select
                        placeholder="Lọc theo loại"
                        value={filterType}
                        onChange={setFilterType}
                        allowClear
                        style={{ minWidth: 160 }}
                        options={[
                            { label: 'IELTS', value: 'IELTS' },
                            { label: 'TOEIC', value: 'TOEIC' },
                        ]}
                    />
                </div>

                <Table
                    columns={columns}
                    dataSource={filteredExams}
                    rowKey="id"
                    loading={isLoading}
                    scroll={{ x: 'max-content' }}
                    pagination={{
                        pageSize: 10,
                        showSizeChanger: true,
                        showTotal: (total) => `Tổng ${total} đề thi`,
                    }}
                    locale={{
                        emptyText: (
                            <Empty
                                image={<FileTextOutlined style={{ fontSize: 48, color: '#cbd5e1' }} />}
                                description={
                                    <span style={{ color: '#94a3b8' }}>Chưa có đề thi nào</span>
                                }
                            />
                        ),
                    }}
                    style={{ borderRadius: 0 }}
                />
            </motion.div>

            <UploadPdfModal open={isUploadOpen} onClose={() => setIsUploadOpen(false)} />
        </motion.div>
    );
};
