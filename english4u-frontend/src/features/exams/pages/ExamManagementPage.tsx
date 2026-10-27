    import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Card, Empty, Modal, Table, message } from 'antd';
import { ExclamationCircleFilled, FileTextOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
    useDeleteExamMutation,
    useExamsQuery,
    useGenerateExamFromPdfMutation,
    useUpdateExamStatusMutation,
} from '@/features/exams/hooks/useExamQueries';
import type { ExamDto } from '@/features/exams/types/exam.types';
import {
    pdfGenerationJobStore,
    usePdfGenerationJobStore,
    formatPdfGenerationErrorMessage,
} from '@/features/exams/components/pdfGenerationJob.store';
import { ExamManagementHeader } from '../components/management/ExamManagementHeader';
import { ExamOverviewStats } from '../components/management/ExamOverviewStats';
import { ExamFilterBar, type PublishFilter } from '../components/management/ExamFilterBar';
import { ExamPdfUploadModal } from '../components/management/ExamPdfUploadModal';
import { createExamColumns } from '../components/management/examManagement.columns';

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

export const ExamManagement = () => {
    const navigate = useNavigate();
    const [pageNumber, setPageNumber] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [searchText, setSearchText] = useState('');
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

    useEffect(() => {
        setPageNumber(1);
    }, [searchText, filterSkill, publishFilter]);

    const isPublishedParam =
        publishFilter === 'PUBLISHED' ? true : publishFilter === 'DRAFT' ? false : undefined;

    const { data: pagedData, isLoading } = useExamsQuery({
        search: searchText.trim() || undefined,
        skill: filterSkill !== 'ALL' ? filterSkill : undefined,
        isPublished: isPublishedParam,
        pageNumber,
        pageSize,
    });

    const exams = pagedData?.items ?? [];
    const totalCount = pagedData?.totalCount ?? 0;

    const deleteMutation = useDeleteExamMutation();
    const updateStatusMutation = useUpdateExamStatusMutation();
    const generateFromPdfMutation = useGenerateExamFromPdfMutation();
    const isPdfGenerationLocked = pdfGenerationJob?.status === 'processing';
    const pdfJobPercent = Math.round(pdfGenerationJob?.progressPercent ?? 0);

    const examOverview = useMemo(() => {
        const total = totalCount;
        const published = exams.filter((exam) => exam.isPublished).length;
        const draft = total - published;
        const totalDuration = exams.reduce((sum, exam) => sum + (exam.durationMinutes ?? 0), 0);
        const avgDuration = exams.length > 0 ? Math.round(totalDuration / exams.length) : 0;

        return {
            total,
            published,
            draft,
            avgDuration,
        };
    }, [exams, totalCount]);

    const skillFilterOptions = useMemo(
        () => ['READING', 'LISTENING', 'WRITING', 'SPEAKING'],
        []
    );

    const hasActiveFilter =
        searchText.trim().length > 0 || filterSkill !== 'ALL' || publishFilter !== 'ALL';

    const resetFilters = () => {
        setSearchText('');
        setFilterSkill('ALL');
        setPublishFilter('ALL');
        setPageNumber(1);
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

        generateFromPdfMutation.mutate(
            { file: fileToUpload, clientRequestId },
            {
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
                    const is503Error =
                        error?.response?.status === 503 ||
                        rawMessage.includes('503') ||
                        rawMessage.includes('Gemini native PDF extraction failed');
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
            }
        );
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
                    const fallbackMessage =
                        error?.code === 'ECONNABORTED'
                            ? 'Xóa đề thi bị timeout.'
                            : typeof apiMessage === 'string'
                            ? apiMessage
                            : 'Xóa đề thi thất bại.';
                    message.error(fallbackMessage);
                }
            },
        });
    };

    const columns = useMemo(
        () =>
            createExamColumns({
                onView: (id) => navigate(`/admin/exams/${id}`),
                onEdit: handleEdit,
                onDelete: handleDelete,
                onToggleStatus: handleToggleStatus,
                isStatusUpdating: (id) =>
                    updateStatusMutation.isPending && updateStatusMutation.variables?.id === id,
                isDeleting: (id) =>
                    deleteMutation.isPending && deleteMutation.variables === id,
            }),
        [navigate, updateStatusMutation, deleteMutation]
    );

    return (
        <>
            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                style={{ display: 'flex', flexDirection: 'column', gap: 18 }}
            >
                <motion.div variants={itemVariants}>
                    <ExamManagementHeader
                        isPdfGenerationLocked={isPdfGenerationLocked}
                        pdfJobPercent={pdfJobPercent}
                        onGenerateAi={() => navigate('/admin/exams/generate-ai')}
                        onOpenPdfModal={handleOpenPdfModal}
                        onCreateExam={() => navigate('/admin/exams/create')}
                    />
                </motion.div>

                <motion.div variants={itemVariants}>
                    <ExamOverviewStats overview={examOverview} />
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
                        <ExamFilterBar
                            searchText={searchText}
                            onSearchTextChange={setSearchText}
                            filterSkill={filterSkill}
                            onFilterSkillChange={setFilterSkill}
                            skillFilterOptions={skillFilterOptions}
                            publishFilter={publishFilter}
                            onPublishFilterChange={setPublishFilter}
                            hasActiveFilter={hasActiveFilter}
                            onResetFilters={resetFilters}
                        />

                        <Table
                            rowKey="id"
                            columns={columns}
                            dataSource={exams}
                            loading={isLoading}
                            scroll={{ x: 'max-content' }}
                            pagination={{
                                current: pageNumber,
                                pageSize,
                                total: totalCount,
                                showSizeChanger: true,
                                pageSizeOptions: ['10', '20', '50'],
                                onChange: (page, size) => {
                                    setPageNumber(page);
                                    setPageSize(size);
                                },
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

            <ExamPdfUploadModal
                open={isPdfModalOpen}
                selectedPdfFile={selectedPdfFile}
                isPdfGenerationLocked={isPdfGenerationLocked}
                isPending={generateFromPdfMutation.isPending}
                onSelectFile={setSelectedPdfFile}
                onCancel={resetPdfForm}
                onStartGenerate={handleStartGenerateFromPdf}
            />
        </>
    );
};

export const ExamManagementPage = ExamManagement;
