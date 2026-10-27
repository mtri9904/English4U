import { useNavigate } from 'react-router-dom';
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
        />
    );
};
