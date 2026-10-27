import type { PdfGenerationJobState, PdfJobStatus } from '../pdfGenerationJob.store';

export type RealtimeEnvelope = {
    type?: string;
    payload?: unknown;
};

export type PdfGenerationProgressPayload = {
    clientRequestId?: string | null;
    uploadId?: string;
    uploadedBy?: string;
    status?: string;
    progressPercent?: number;
    stage?: string;
    message?: string;
    passageNumber?: number | null;
    totalPassages?: number | null;
    examId?: string | null;
};

export const getStatusTone = (job: PdfGenerationJobState) => {
    if (job.status === 'failed') {
        return {
            border: '#fecaca',
            shadow: '0 20px 40px rgba(127, 29, 29, 0.18)',
            accent: '#dc2626',
            progress: '#ef4444',
            badgeBg: '#fee2e2',
            badgeColor: '#b91c1c',
            chipBg: 'linear-gradient(135deg, #991b1b 0%, #dc2626 100%)',
            label: 'Thất bại',
        };
    }

    if (job.status === 'completed') {
        return {
            border: '#bbf7d0',
            shadow: '0 20px 40px rgba(21, 128, 61, 0.16)',
            accent: '#16a34a',
            progress: '#22c55e',
            badgeBg: '#dcfce7',
            badgeColor: '#166534',
            chipBg: 'linear-gradient(135deg, #166534 0%, #22c55e 100%)',
            label: 'Hoàn tất',
        };
    }

    return {
        border: '#bfdbfe',
        shadow: '0 20px 40px rgba(29, 78, 216, 0.18)',
        accent: '#2563eb',
        progress: '#2563eb',
        badgeBg: '#dbeafe',
        badgeColor: '#1d4ed8',
        chipBg: 'linear-gradient(135deg, #1d4ed8 0%, #0f172a 100%)',
        label: 'Đang chạy',
    };
};

export const normalizeGuidLike = (value?: string | null) => {
    if (!value) {
        return null;
    }
    const normalized = value.trim().replace(/[{}]/g, '').toLowerCase();
    return normalized.length > 0 ? normalized : null;
};

export const mapProgressStatus = (status?: string): PdfJobStatus =>
    status === 'completed'
        ? 'completed'
        : status === 'failed'
            ? 'failed'
            : 'processing';

