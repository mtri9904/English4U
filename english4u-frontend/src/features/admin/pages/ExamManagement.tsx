import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
    Button,
    Card,
    Empty,
    Input,
    Modal,
    Select,
    Space,
    Switch,
    Table,
    Tag,
    Tooltip,
    Upload,
    message,
} from 'antd';
import {
    CheckCircleOutlined,
    ClockCircleOutlined,
    DeleteOutlined,
    EditOutlined,
    ExclamationCircleFilled,
    EyeOutlined,
    FileTextOutlined,
    InboxOutlined,
    PlusOutlined,
    ReloadOutlined,
    SearchOutlined,
    ThunderboltOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import {
    useDeleteExamMutation,
    useExamsQuery,
    useGenerateExamFromPdfMutation,
    useUpdateExamStatusMutation,
} from '../api/exam.api';
import type { ExamDto } from '../types/exam.types';
import { pdfGenerationJobStore, usePdfGenerationJobStore, formatPdfGenerationErrorMessage } from '../stores/pdfGenerationJob.store';

type PublishFilter = 'ALL' | 'PUBLISHED' | 'DRAFT';

const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.08 },
    },
};

const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0 },
};

const examTypeColorMap: Record<string, { bg: string; color: string }> = {
    IELTS: { bg: '#ede9fe', color: '#7c3aed' },
    TOEIC: { bg: '#dbeafe', color: '#2563eb' },
};

const skillColors: Record<string, string> = {
    Reading: '#10b981',
    Listening: '#6366f1',
    Writing: '#f59e0b',
    Speaking: '#ef4444',
};

const formatSkillLabel = (value?: string | null) => {
    const normalized = (value ?? '').trim().toLowerCase();
    if (!normalized) return '';
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const getPrimarySkill = (exam: ExamDto) => {
    const firstSkill = exam.skillTypes?.find((skill) => skill?.trim());
    if (firstSkill) return formatSkillLabel(firstSkill);
    return formatSkillLabel(exam.sections?.[0]?.skillType);
};

const iconButtonStyle = {
    borderRadius: 10,
    width: 34,
    height: 34,
    border: '1px solid #e2e8f0',
    background: '#fff',
};

const { Dragger } = Upload;

export const ExamManagement = () => {
    const navigate = useNavigate();
    const [searchText, setSearchText] = useState('');
    const [filterType, setFilterType] = useState<string>('IELTS');
    const [filterSkill, setFilterSkill] = useState<string>('ALL');
    const [publishFilter, setPublishFilter] = useState<PublishFilter>('ALL');
    const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
    const [selectedPdfFile, setSelectedPdfFile] = useState<File | null>(null);
    const { job: pdfGenerationJob, openUploadModalTrigger } = usePdfGenerationJobStore();

    useEffect(() => {
        if (openUploadModalTrigger) {
            setIsPdfModalOpen(true);
            pdfGenerationJobStore.setOpenUploadModalTrigger(false);
        }
    }, [openUploadModalTrigger]);

    const { data: exams = [], isLoading } = useExamsQuery();
    const deleteMutation = useDeleteExamMutation();
    const updateStatusMutation = useUpdateExamStatusMutation();
    const generateFromPdfMutation = useGenerateExamFromPdfMutation();
    const isPdfGenerationLocked = pdfGenerationJob?.status === 'processing';
    const pdfJobPercent = Math.round(pdfGenerationJob?.progressPercent ?? 0);

    const examOverview = useMemo(() => {
        const total = exams.length;
        const published = exams.filter((exam) => exam.isPublished).length;
        const draft = total - published;
        const totalDuration = exams.reduce((sum, exam) => sum + (exam.durationMinutes ?? 0), 0);
        const avgDuration = total > 0 ? Math.round(totalDuration / total) : 0;

        return {
            total,
            published,
            draft,
            avgDuration,
        };
    }, [exams]);

    const skillFilterOptions = useMemo(
        () =>
            Array.from(
                new Set(
                    exams
                        .map((exam) => getPrimarySkill(exam))
                        .filter((skill) => !!skill)
                )
            ).sort((left, right) => left.localeCompare(right)),
        [exams]
    );

    const filteredExams = useMemo(() => {
        const normalizedSearch = searchText.trim().toLowerCase();

        return exams.filter((exam) => {
            const examTitle = (exam.title ?? '').toLowerCase();
            const description = exam.description?.toLowerCase() ?? '';
            const matchSearch =
                !normalizedSearch ||
                examTitle.includes(normalizedSearch) ||
                description.includes(normalizedSearch);

            const matchType = filterType === 'ALL' || exam.examType === filterType;
            const matchSkill = filterSkill === 'ALL' || getPrimarySkill(exam) === filterSkill;
            const matchPublish =
                publishFilter === 'ALL' ||
                (publishFilter === 'PUBLISHED' && exam.isPublished) ||
                (publishFilter === 'DRAFT' && !exam.isPublished);

            return matchSearch && matchType && matchSkill && matchPublish;
        });
    }, [exams, filterSkill, filterType, publishFilter, searchText]);

    const hasActiveFilter =
        searchText.trim().length > 0 || filterType !== 'IELTS' || filterSkill !== 'ALL' || publishFilter !== 'ALL';

    const resetFilters = () => {
        setSearchText('');
        setFilterType('IELTS');
        setFilterSkill('ALL');
        setPublishFilter('ALL');
    };

    const resetPdfForm = () => {
        setSelectedPdfFile(null);
        setIsPdfModalOpen(false);
    };

    const handleOpenPdfModal = () => {
        if (isPdfGenerationLocked) {
            message.warning('PDF đang được generate. Chỉ có thể upload file mới sau khi tiến trình hoàn tất hoặc thất bại.');
            return;
        }

        setIsPdfModalOpen(true);
    };

    const handleStartGenerateFromPdf = () => {
        if (isPdfGenerationLocked) {
            message.warning('Đang có một tiến trình generate PDF chạy. Vui lòng chờ hoàn tất hoặc thất bại rồi thử lại.');
            return;
        }

        if (!selectedPdfFile) {
            message.warning('Vui lòng chọn file PDF trước khi bắt đầu.');
            return;
        }

        const fileToUpload = selectedPdfFile;
        const clientRequestId = crypto.randomUUID();
        pdfGenerationJobStore.setFile(fileToUpload);
        pdfGenerationJobStore.setJob({
            clientRequestId,
            uploadId: null,
            fileName: fileToUpload.name,
            status: 'processing',
            progressPercent: 1,
            stage: 'uploading',
            message: 'Đang upload file và khởi tạo tiến trình.',
            examId: null,
            passageNumber: null,
            totalPassages: null,
        });

        resetPdfForm();

        generateFromPdfMutation.mutate({ file: fileToUpload, clientRequestId }, {
            onSuccess: (result) => {
                pdfGenerationJobStore.updateJob((previous) => {
                    if (!previous || previous.clientRequestId !== clientRequestId) {
                        return previous;
                    }
                    return {
                        clientRequestId: previous.clientRequestId,
                        uploadId: result.uploadId,
                        fileName: previous.fileName ?? fileToUpload.name,
                        status: 'completed',
                        progressPercent: 100,
                        stage: 'completed',
                        message: `Hoàn tất tạo đề với ${result.questionCount} câu hỏi.`,
                        examId: result.examId,
                        passageNumber: previous.passageNumber ?? null,
                        totalPassages: result.passageCount,
                    };
                });
                message.success('Tạo đề từ PDF thành công.');
            },
            onError: (error: any) => {
                const apiMessage = error?.response?.data?.message;
                const rawMessage = typeof apiMessage === 'string' ? apiMessage : 'Tạo đề từ PDF thất bại.';
                const is503Error = error?.response?.status === 503 || rawMessage.includes('503') || rawMessage.includes('Gemini native PDF extraction failed');
                const store = pdfGenerationJobStore.getState();
                const willRetry = is503Error && store.file && store.retryCount < 3;

                const fallbackMessage = formatPdfGenerationErrorMessage(rawMessage);

                pdfGenerationJobStore.updateJob((previous) => {
                    if (!previous || previous.clientRequestId !== clientRequestId) {
                        return previous;
                    }
                    return {
                        clientRequestId: previous.clientRequestId,
                        uploadId: previous.uploadId ?? null,
                        fileName: previous.fileName ?? fileToUpload.name,
                        status: 'failed',
                        progressPercent: previous.progressPercent ?? 0,
                        stage: 'failed',
                        message: fallbackMessage,
                        examId: previous.examId ?? null,
                        passageNumber: previous.passageNumber ?? null,
                        totalPassages: previous.totalPassages ?? null,
                    };
                });

                if (!willRetry) {
                    message.error(fallbackMessage);
                }
            },
        });
    };

    const handleEdit = (id: string) => {
        navigate(`/admin/exams/edit/${id}`);
    };

    const handleToggleStatus = (id: string, isPublished: boolean) => {
        updateStatusMutation.mutate(
            { id, isPublished },
            {
                onSuccess: () => message.success('Cập nhật trạng thái thành công.'),
                onError: () => message.error('Cập nhật trạng thái thất bại.'),
            }
        );
    };

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
            onOk: async () => {
                try {
                    await deleteMutation.mutateAsync(exam.id);
                    message.success('Đã xóa đề thi thành công.');
                } catch (error: any) {
                    const apiMessage =
                        error?.response?.data?.message ||
                        error?.response?.data?.detail ||
                        error?.response?.data?.title;
                    const fallbackMessage = error?.code === 'ECONNABORTED'
                        ? 'Xóa đề thi bị timeout.'
                        : typeof apiMessage === 'string'
                            ? apiMessage
                            : 'Xóa đề thi thất bại.';
                    message.error(fallbackMessage);
                }
            },
        });
    };

    const columns: ColumnsType<ExamDto> = [
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
                    onChange={(checked) => handleToggleStatus(record.id, checked)}
                    loading={
                        updateStatusMutation.isPending &&
                        updateStatusMutation.variables?.id === record.id
                    }
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
                            onClick={() => navigate(`/admin/exams/${record.id}`)}
                            style={{ ...iconButtonStyle, color: '#0ea5e9' }}
                        />
                    </Tooltip>
                    <Tooltip title="Chỉnh sửa">
                        <Button
                            icon={<EditOutlined />}
                            onClick={() => handleEdit(record.id)}
                            style={{ ...iconButtonStyle, color: '#f59e0b' }}
                        />
                    </Tooltip>
                    <Tooltip title="Xóa">
                        <Button
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => handleDelete(record)}
                            loading={deleteMutation.isPending && deleteMutation.variables === record.id}
                            style={iconButtonStyle}
                        />
                    </Tooltip>
                </Space>
            ),
        },
    ];

    return (
        <>
            <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            style={{ display: 'flex', flexDirection: 'column', gap: 18 }}
            >
            <motion.div variants={itemVariants}>
                <div
                    style={{
                        borderRadius: 18,
                        padding: 22,
                        background: 'radial-gradient(circle at 0% 0%, #0ea5e9 0%, #1d4ed8 52%, #0f172a 100%)',
                        border: '1px solid rgba(148, 163, 184, 0.35)',
                        color: '#fff',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 12,
                            flexWrap: 'wrap',
                        }}
                    >
                        <div>
                            <div style={{ fontSize: '1.55rem', fontWeight: 800, marginBottom: 6 }}>
                                Quản lý Đề thi
                            </div>
                            <div style={{ color: 'rgba(226, 232, 240, 0.92)' }}>
                                Theo dõi, xuất bản và quản lý kho đề theo từng kỹ năng trong CMS.
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                                <Button
                                    icon={<ThunderboltOutlined />}
                                    onClick={() => navigate('/admin/exams/generate-ai')}
                                    style={{
                                        borderRadius: 10,
                                        border: '1px solid rgba(255, 255, 255, 0.45)',
                                        height: 40,
                                        paddingInline: 16,
                                        fontWeight: 700,
                                        color: '#e2e8f0',
                                        background: 'rgba(99, 102, 241, 0.35)',
                                    }}
                                >
                                    Sinh đề bằng AI
                                </Button>
                            </motion.div>

                            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                                <Button
                                    icon={<InboxOutlined />}
                                    onClick={handleOpenPdfModal}
                                    disabled={isPdfGenerationLocked}
                                    style={{
                                        borderRadius: 10,
                                        border: isPdfGenerationLocked
                                            ? '1px solid rgba(148, 163, 184, 0.35)'
                                            : '1px solid rgba(255, 255, 255, 0.45)',
                                        height: 40,
                                        paddingInline: 16,
                                        fontWeight: 700,
                                        color: isPdfGenerationLocked ? 'rgba(226, 232, 240, 0.6)' : '#e2e8f0',
                                        background: isPdfGenerationLocked
                                            ? 'rgba(15, 23, 42, 0.18)'
                                            : 'rgba(15, 23, 42, 0.35)',
                                    }}
                                >
                                    {isPdfGenerationLocked ? `Đang generate ${pdfJobPercent}%` : 'Gen đề từ PDF'}
                                </Button>
                            </motion.div>

                            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                                <Button
                                    icon={<PlusOutlined />}
                                    onClick={() => navigate('/admin/exams/create')}
                                    style={{
                                        borderRadius: 10,
                                        border: 'none',
                                        height: 40,
                                        paddingInline: 16,
                                        fontWeight: 700,
                                        color: '#fff',
                                        background: 'linear-gradient(135deg, #22d3ee 0%, #2563eb 58%, #4338ca 100%)',
                                        boxShadow: '0 8px 20px rgba(37, 99, 235, 0.35)',
                                    }}
                                >
                                    Tạo đề thi mới
                                </Button>
                            </motion.div>
                        </div>
                    </div>
                </div>
            </motion.div>

            <motion.div
                variants={itemVariants}
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                    gap: 12,
                }}
            >
                <Card style={{ borderRadius: 14, border: '1px solid #dbeafe' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ color: '#64748b', fontSize: '0.82rem' }}>Tổng đề thi</div>
                            <div style={{ color: '#0f172a', fontWeight: 800, fontSize: '1.55rem' }}>
                                {examOverview.total}
                            </div>
                        </div>
                        <FileTextOutlined style={{ color: '#2563eb', fontSize: 20 }} />
                    </div>
                </Card>
                <Card style={{ borderRadius: 14, border: '1px solid #dcfce7' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ color: '#64748b', fontSize: '0.82rem' }}>Đang xuất bản</div>
                            <div style={{ color: '#0f172a', fontWeight: 800, fontSize: '1.55rem' }}>
                                {examOverview.published}
                            </div>
                        </div>
                        <CheckCircleOutlined style={{ color: '#16a34a', fontSize: 20 }} />
                    </div>
                </Card>
                <Card style={{ borderRadius: 14, border: '1px solid #fee2e2' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ color: '#64748b', fontSize: '0.82rem' }}>Đề nháp</div>
                            <div style={{ color: '#0f172a', fontWeight: 800, fontSize: '1.55rem' }}>
                                {examOverview.draft}
                            </div>
                        </div>
                        <EditOutlined style={{ color: '#dc2626', fontSize: 20 }} />
                    </div>
                </Card>
                <Card style={{ borderRadius: 14, border: '1px solid #ede9fe' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ color: '#64748b', fontSize: '0.82rem' }}>Thời gian TB</div>
                            <div style={{ color: '#0f172a', fontWeight: 800, fontSize: '1.55rem' }}>
                                {examOverview.avgDuration} phút
                            </div>
                        </div>
                        <ClockCircleOutlined style={{ color: '#7c3aed', fontSize: 20 }} />
                    </div>
                </Card>
            </motion.div>

            <motion.div variants={itemVariants}>
                <Card
                    title="Danh sách đề thi"
                    style={{ borderRadius: 14, border: '1px solid #e2e8f0' }}
                    headStyle={{
                        borderBottom: '1px solid #e2e8f0',
                        fontWeight: 700,
                    }}
                >
                    <div
                        style={{
                            marginBottom: 14,
                            display: 'flex',
                            gap: 10,
                            flexWrap: 'wrap',
                            alignItems: 'center',
                        }}
                    >
                        <Input
                            value={searchText}
                            onChange={(event) => setSearchText(event.target.value)}
                            allowClear
                            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                            placeholder="Tìm theo tên đề hoặc mô tả..."
                            style={{ minWidth: 250, flex: 2, borderRadius: 10 }}
                        />

                        <Select
                            value={filterSkill}
                            onChange={setFilterSkill}
                            style={{ minWidth: 150, flex: 1 }}
                            options={[
                                { value: 'ALL', label: 'Tất cả kỹ năng' },
                                ...skillFilterOptions.map((skill) => ({
                                    value: skill,
                                    label: skill,
                                })),
                            ]}
                        />
                        <Select
                            value={publishFilter}
                            onChange={(value: PublishFilter) => setPublishFilter(value)}
                            style={{ minWidth: 160, flex: 1 }}
                            options={[
                                { value: 'ALL', label: 'Tất cả trạng thái' },
                                { value: 'PUBLISHED', label: 'Đang xuất bản' },
                                { value: 'DRAFT', label: 'Đề nháp' },
                            ]}
                        />
                        <Button
                            icon={<ReloadOutlined />}
                            onClick={resetFilters}
                            disabled={!hasActiveFilter}
                            style={{ borderRadius: 10 }}
                        >
                            Xóa lọc
                        </Button>
                    </div>

                    <Table
                        rowKey="id"
                        columns={columns}
                        dataSource={filteredExams}
                        loading={isLoading}
                        scroll={{ x: 'max-content' }}
                        pagination={{
                            pageSize: 10,
                            showSizeChanger: true,
                            pageSizeOptions: ['10', '20', '50'],
                        }}
                        locale={{
                            emptyText: (
                                <Empty
                                    image={<FileTextOutlined style={{ fontSize: 48, color: '#cbd5e1' }} />}
                                    description={<span style={{ color: '#94a3b8' }}>Chưa có đề thi phù hợp bộ lọc.</span>}
                                />
                            ),
                        }}
                    />
                </Card>
            </motion.div>
            </motion.div>

            <Modal
                title="Generate đề Reading từ PDF"
                open={isPdfModalOpen}
                onCancel={resetPdfForm}
                okText="Bắt đầu generate"
                cancelText="Hủy"
                onOk={handleStartGenerateFromPdf}
                okButtonProps={{ disabled: !selectedPdfFile || generateFromPdfMutation.isPending || isPdfGenerationLocked }}
                cancelButtonProps={{ disabled: generateFromPdfMutation.isPending }}
                destroyOnClose
            >
                <div style={{ color: '#475569', marginBottom: 12 }}>
                    {isPdfGenerationLocked
                        ? 'Hệ thống đang generate một file PDF khác. Chỉ có thể upload file mới sau khi tiến trình hiện tại hoàn tất hoặc thất bại.'
                        : 'Upload file PDF đề IELTS Reading, hệ thống sẽ tự tách passage, gọi Gemma và tạo đề mới.'}
                </div>
                <Dragger
                    accept=".pdf"
                    multiple={false}
                    maxCount={1}
                    beforeUpload={(file) => {
                        setSelectedPdfFile(file);
                        return false;
                    }}
                    showUploadList={false}
                    disabled={generateFromPdfMutation.isPending || isPdfGenerationLocked}
                >
                    <p style={{ marginBottom: 8 }}>
                        <InboxOutlined style={{ fontSize: 30, color: isPdfGenerationLocked ? '#94a3b8' : '#2563eb' }} />
                    </p>
                    <p style={{ fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>
                        {isPdfGenerationLocked ? 'Đang khóa upload trong lúc generate' : 'Bấm hoặc kéo file PDF vào đây'}
                    </p>
                    <p style={{ color: '#64748b', margin: 0 }}>
                        {isPdfGenerationLocked ? 'Hoàn tất hoặc thất bại rồi mới được upload tiếp' : 'Chỉ hỗ trợ định dạng `.pdf`'}
                    </p>
                </Dragger>
                {selectedPdfFile ? (
                    <div style={{ marginTop: 12, fontSize: '0.82rem', color: '#0f172a' }}>
                        File đã chọn: <strong>{selectedPdfFile.name}</strong>
                    </div>
                ) : null}
            </Modal>
        </>
    );
};
