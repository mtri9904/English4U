import { useNavigate } from 'react-router-dom';
import { Modal, message } from 'antd';
import { examApi } from '../services/exam.service';
import { pdfGenerationJobStore } from './pdfGenerationJob.store';
import {
    getStatusTone,
    usePdfGenerationSync,
    PdfGenerationCollapsedChip,
    PdfGenerationFullCard,
} from './pdf-widget';

export const PdfGenerationProgressWidget = () => {
    const navigate = useNavigate();
    const { job: pdfGenerationJob, isCollapsed } = usePdfGenerationSync();

    if (!pdfGenerationJob) {
        return null;
    }

    const pdfJobPercent = Math.round(pdfGenerationJob.progressPercent);
    const pdfJobStatusTone = getStatusTone(pdfGenerationJob);

    const handleCloseWidget = () => {
        if (pdfGenerationJob.status === 'processing') {
            pdfGenerationJobStore.setCollapsed(true);
            return;
        }

        pdfGenerationJobStore.clear();
    };

    const handleViewExam = (examId: string) => {
        pdfGenerationJobStore.clear();
        navigate(`/admin/exams/${examId}`);
    };

    const handleRetry = () => {
        pdfGenerationJobStore.clear();
        pdfGenerationJobStore.setOpenUploadModalTrigger(true);
        navigate('/admin/exams');
    };

    const handleCancel = () => {
        Modal.confirm({
            title: 'Hủy tiến trình tạo đề?',
            content: 'Bạn có chắc chắn muốn hủy tiến trình tạo đề này? Thao tác này sẽ dừng tác vụ xử lý trên server.',
            okText: 'Hủy tiến trình',
            okType: 'danger',
            cancelText: 'Đóng',
            centered: true,
            onOk: async () => {
                const currentJob = pdfGenerationJobStore.getJob();
                try {
                    if (currentJob) {
                        await examApi.cancelPdfGeneration({
                            clientRequestId: currentJob.clientRequestId,
                            uploadId: currentJob.uploadId,
                        });
                    }
                } catch {
                    // Ignore transient errors on cancellation
                }
                pdfGenerationJobStore.cancelJob();
                message.info('Đã hủy tiến trình tạo đề.');
            },
        });
    };

    if (isCollapsed) {
        return (
            <PdfGenerationCollapsedChip
                progressPercent={pdfJobPercent}
                statusTone={pdfJobStatusTone}
            />
        );
    }

    return (
        <PdfGenerationFullCard
            job={pdfGenerationJob}
            statusTone={pdfJobStatusTone}
            onClose={handleCloseWidget}
            onViewExam={handleViewExam}
            onRetry={handleRetry}
            onCancel={handleCancel}
        />
    );
};
