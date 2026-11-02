import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Card, Empty, Modal, Table, message } from 'antd';
import { ExclamationCircleFilled } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useUrlFilters } from '@/shared/hooks';
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
import { createExamColumns } from '../configs/exam.columns';
import { createTablePagination } from '@/components/AppPagination';
import { APP_EMPTY_IMAGE } from '@/components/AppEmpty';

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

interface ExamUrlFilters {
    search: string;
    skill: string;
    publish: PublishFilter;
    page: number;
    pageSize: number;
}

const DEFAULT_EXAM_FILTERS: ExamUrlFilters = {
    search: '',
    skill: 'ALL',
    publish: 'ALL',
    page: 1,
    pageSize: 10,
};

export const ExamManagement = () => {
    const navigate = useNavigate();
    const {
        filters,
        getSearchInputValue,
        setFilter,
        setFilters,
        resetFilters,
        hasActiveFilters,
    } = useUrlFilters<ExamUrlFilters>({
        defaultValues: DEFAULT_EXAM_FILTERS,
        pageKey: 'page',
    });

    const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
    const [selectedPdfFile, setSelectedPdfFile] = useState<File | null>(null);
    const { job: pdfGenerationJob, openUploadModalTrigger } = usePdfGenerationJobStore();

    useEffect(() => {
        if (openUploadModalTrigger) {
            setIsPdfModalOpen(true);
            pdfGenerationJobStore.setOpenUploadModalTrigger(false);
        }
    }, [openUploadModalTrigger]);

    const isPublishedParam =
        filters.publish === 'PUBLISHED' ? true : filters.publish === 'DRAFT' ? false : undefined;

    const { data: pagedData, isLoading } = useExamsQuery({
        search: filters.search.trim() || undefined,
        searchTerm: filters.search.trim() || undefined,
        skill: filters.skill !== 'ALL' ? filters.skill : undefined,
        isPublished: isPublishedParam,
        pageNumber: filters.page,
        pageSize: filters.pageSize,
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
            centered: true,
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
                            searchText={getSearchInputValue('search')}
                            onSearchTextChange={(val) => setFilter('search', val)}
                            filterSkill={filters.skill}
                            onFilterSkillChange={(val) => setFilter('skill', val)}
                            skillFilterOptions={skillFilterOptions}
                            publishFilter={filters.publish}
                            onPublishFilterChange={(val) => setFilter('publish', val)}
                            hasActiveFilter={hasActiveFilters}
                            onResetFilters={resetFilters}
                        />

                        <Table
                            rowKey="id"
                            columns={columns}
                            dataSource={exams}
                            loading={isLoading}
                            scroll={{ x: 'max-content' }}
                            pagination={createTablePagination({
                                current: filters.page,
                                pageSize: filters.pageSize,
                                total: totalCount,
                                onChange: (page, size) => {
                                    setFilters({ page, pageSize: size });
                                },
                                entityLabel: 'đề thi',
                                pageSizeOptions: ['10', '20', '50'],
                            })}
                            locale={{
                                emptyText: (
                                    <Empty
                                        image={APP_EMPTY_IMAGE}
                                        imageStyle={{ height: 96 }}
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
