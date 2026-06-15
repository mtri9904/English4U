import { useEffect } from 'react';
import { Button, Progress } from 'antd';
import { CloseOutlined, EyeOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { REALTIME_BROWSER_EVENT } from '@/features/realtime/hooks/useRealtimeSync';
import { examApi } from '../api/exam.api';
import { pdfGenerationJobStore, usePdfGenerationJobStore, type PdfGenerationJobState, type PdfJobStatus } from '../stores/pdfGenerationJob.store';

type RealtimeEnvelope = {
    type?: string;
    payload?: unknown;
};

type PdfGenerationProgressPayload = {
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

const getStatusTone = (job: PdfGenerationJobState) => {
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

const normalizeGuidLike = (value?: string | null) => {
    if (!value) {
        return null;
    }

    const normalized = value.trim().replace(/[{}]/g, '').toLowerCase();
    return normalized.length > 0 ? normalized : null;
};

const mapProgressStatus = (status?: string): PdfJobStatus =>
    status === 'completed'
        ? 'completed'
        : status === 'failed'
            ? 'failed'
            : 'processing';

export const PdfGenerationProgressWidget = () => {
    const navigate = useNavigate();
    const { job: pdfGenerationJob, isCollapsed } = usePdfGenerationJobStore();

    useEffect(() => {
        const handleRealtimeEvent = (event: Event) => {
            const customEvent = event as CustomEvent<RealtimeEnvelope>;
            const detail = customEvent.detail;
            if (!detail || detail.type !== 'exam.pdf-generation.progress' || !detail.payload) {
                return;
            }

            const payload = detail.payload as PdfGenerationProgressPayload;
            const eventClientRequestId = payload.clientRequestId?.trim() || null;
            const currentUserId = normalizeGuidLike(localStorage.getItem('userId'));
            const eventUploadedBy = normalizeGuidLike(payload.uploadedBy);
            const activeJob = pdfGenerationJobStore.getState().job;
            const activeClientRequestId = activeJob?.clientRequestId?.trim() || null;
            const eventUploadId = normalizeGuidLike(payload.uploadId);
            const activeUploadId = normalizeGuidLike(activeJob?.uploadId);

            const isSameClientRequest = !!activeClientRequestId && !!eventClientRequestId && activeClientRequestId === eventClientRequestId;
            const isSameUser = !!currentUserId && !!eventUploadedBy && currentUserId === eventUploadedBy;
            const isSameUpload = !!eventUploadId && !!activeUploadId && eventUploadId === activeUploadId;
            const shouldBindPendingJob =
                activeJob?.status === 'processing' &&
                !activeUploadId &&
                !!eventClientRequestId &&
                !!activeClientRequestId &&
                activeClientRequestId === eventClientRequestId;
            const shouldAdoptFirstProgressEvent =
                activeJob?.status === 'processing' &&
                !activeUploadId &&
                (activeJob.progressPercent ?? 0) <= 1 &&
                (!!eventUploadId || !!eventClientRequestId);

            if (!isSameClientRequest && !isSameUpload && !shouldBindPendingJob && !shouldAdoptFirstProgressEvent && !isSameUser) {
                return;
            }

            const normalizedStatus: PdfJobStatus =
                payload.status === 'completed'
                    ? 'completed'
                    : payload.status === 'failed'
                        ? 'failed'
                        : 'processing';

            pdfGenerationJobStore.updateJob((previous) => {
                const previousUploadId = normalizeGuidLike(previous?.uploadId);
                if (
                    previousUploadId &&
                    eventUploadId &&
                    previousUploadId !== eventUploadId &&
                    previous.status === 'processing'
                ) {
                    return previous;
                }

                return {
                    clientRequestId: eventClientRequestId ?? previous?.clientRequestId ?? null,
                    uploadId: payload.uploadId ?? previous?.uploadId ?? null,
                    fileName: previous?.fileName ?? 'uploaded.pdf',
                    status: normalizedStatus,
                    progressPercent: Math.max(0, Math.min(100, payload.progressPercent ?? previous?.progressPercent ?? 0)),
                    stage: payload.stage ?? previous?.stage ?? 'processing',
                    message: payload.message ?? previous?.message ?? 'Đang xử lý PDF.',
                    examId: payload.examId ?? previous?.examId ?? null,
                    passageNumber: payload.passageNumber ?? previous?.passageNumber ?? null,
                    totalPassages: payload.totalPassages ?? previous?.totalPassages ?? null,
                };
            });
        };

        window.addEventListener(REALTIME_BROWSER_EVENT, handleRealtimeEvent as EventListener);
        return () => {
            window.removeEventListener(REALTIME_BROWSER_EVENT, handleRealtimeEvent as EventListener);
        };
    }, []);

    useEffect(() => {
        if (!pdfGenerationJob || pdfGenerationJob.status !== 'processing') {
            return;
        }

        const clientRequestId = pdfGenerationJob.clientRequestId?.trim() || null;
        const uploadId = pdfGenerationJob.uploadId?.trim() || null;
        if (!clientRequestId && !uploadId) {
            return;
        }

        let disposed = false;
        let pollTimer: number | null = null;

        const scheduleNextPoll = (delayMs: number) => {
            if (disposed) {
                return;
            }

            pollTimer = window.setTimeout(() => {
                void pollProgress();
            }, delayMs);
        };

        const pollProgress = async () => {
            try {
                const snapshot = await examApi.getPdfGenerationProgress({ clientRequestId, uploadId });
                if (disposed) {
                    return;
                }

                pdfGenerationJobStore.updateJob((previous) => ({
                    clientRequestId: snapshot.clientRequestId ?? previous?.clientRequestId ?? clientRequestId,
                    uploadId: snapshot.uploadId ?? previous?.uploadId ?? uploadId,
                    fileName: previous?.fileName ?? 'uploaded.pdf',
                    status: mapProgressStatus(snapshot.status),
                    progressPercent: Math.max(0, Math.min(100, snapshot.progressPercent ?? previous?.progressPercent ?? 0)),
                    stage: snapshot.stage ?? previous?.stage ?? 'processing',
                    message: snapshot.message ?? previous?.message ?? 'Đang xử lý PDF.',
                    examId: snapshot.examId ?? previous?.examId ?? null,
                    passageNumber: snapshot.passageNumber ?? previous?.passageNumber ?? null,
                    totalPassages: snapshot.totalPassages ?? previous?.totalPassages ?? null,
                }));

                if (snapshot.status === 'completed' || snapshot.status === 'failed') {
                    return;
                }
            } catch {
                if (disposed) {
                    return;
                }
            }

            scheduleNextPoll(2000);
        };

        scheduleNextPoll(uploadId ? 0 : 750);

        return () => {
            disposed = true;
            if (pollTimer !== null) {
                window.clearTimeout(pollTimer);
            }
        };
    }, [
        pdfGenerationJob?.clientRequestId,
        pdfGenerationJob?.status,
        pdfGenerationJob?.uploadId,
    ]);

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

    if (isCollapsed) {
        return (
            <div
                role="button"
                tabIndex={0}
                onClick={() => pdfGenerationJobStore.setCollapsed(false)}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        pdfGenerationJobStore.setCollapsed(false);
                    }
                }}
                style={{
                    position: 'fixed',
                    right: 20,
                    bottom: 20,
                    width: 84,
                    height: 84,
                    zIndex: 1200,
                    borderRadius: 28,
                    border: `1px solid ${pdfJobStatusTone.border}`,
                    background: pdfJobStatusTone.chipBg,
                    boxShadow: pdfJobStatusTone.shadow,
                    color: '#fff',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    userSelect: 'none',
                }}
            >
                <div style={{ fontSize: '1.45rem', lineHeight: 1, fontWeight: 900 }}>
                    {pdfJobPercent}%
                </div>
                <div
                    style={{
                        width: 26,
                        height: 4,
                        borderRadius: 999,
                        marginTop: 10,
                        background: 'rgba(255, 255, 255, 0.55)',
                    }}
                />
            </div>
        );
    }

    return (
        <div
            style={{
                position: 'fixed',
                right: 20,
                bottom: 20,
                width: 392,
                maxWidth: 'calc(100vw - 24px)',
                zIndex: 1200,
                borderRadius: 22,
                border: `1px solid ${pdfJobStatusTone.border}`,
                background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
                boxShadow: pdfJobStatusTone.shadow,
                overflow: 'hidden',
            }}
        >
            <div
                style={{
                    padding: '16px 18px 14px',
                    background: `linear-gradient(135deg, ${pdfJobStatusTone.badgeBg} 0%, #ffffff 100%)`,
                    borderBottom: '1px solid rgba(148, 163, 184, 0.16)',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                            <div
                                style={{
                                    width: 10,
                                    height: 10,
                                    borderRadius: 999,
                                    background: pdfJobStatusTone.accent,
                                    boxShadow: `0 0 0 6px ${pdfJobStatusTone.badgeBg}`,
                                    flexShrink: 0,
                                }}
                            />
                            <div style={{ fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>
                                Tiến độ generate PDF
                            </div>
                            <span
                                style={{
                                    padding: '4px 10px',
                                    borderRadius: 999,
                                    background: pdfJobStatusTone.badgeBg,
                                    color: pdfJobStatusTone.badgeColor,
                                    fontSize: '0.72rem',
                                    fontWeight: 800,
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {pdfJobStatusTone.label}
                            </span>
                        </div>
                        <div
                            style={{
                                color: '#475569',
                                fontSize: '0.8rem',
                                lineHeight: 1.5,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                            }}
                        >
                            {pdfGenerationJob.fileName}
                        </div>
                    </div>
                    <Button
                        type="text"
                        size="small"
                        icon={<CloseOutlined />}
                        onClick={handleCloseWidget}
                        style={{ color: '#64748b', flexShrink: 0 }}
                    />
                </div>
            </div>

            <div style={{ padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 10 }}>
                    <div style={{ color: '#334155', fontSize: '0.82rem', fontWeight: 700 }}>
                        {pdfGenerationJob.message}
                    </div>
                    <div style={{ color: pdfJobStatusTone.accent, fontSize: '1.5rem', fontWeight: 900, lineHeight: 1 }}>
                        {pdfJobPercent}%
                    </div>
                </div>

                <Progress
                    percent={pdfJobPercent}
                    showInfo={false}
                    status={
                        pdfGenerationJob.status === 'failed'
                            ? 'exception'
                            : pdfGenerationJob.status === 'completed'
                                ? 'success'
                                : 'active'
                    }
                    strokeColor={pdfJobStatusTone.progress}
                    trailColor="#e2e8f0"
                    strokeLinecap="round"
                />

                <div
                    style={{
                        marginTop: 12,
                        display: 'grid',
                        gridTemplateColumns: pdfGenerationJob.passageNumber && pdfGenerationJob.totalPassages ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)',
                        gap: 10,
                    }}
                >
                    <div
                        style={{
                            borderRadius: 14,
                            padding: '10px 12px',
                            background: '#eff6ff',
                            border: '1px solid #dbeafe',
                        }}
                    >
                        <div style={{ color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            Trạng thái
                        </div>
                        <div style={{ color: '#0f172a', fontWeight: 800, marginTop: 2 }}>
                            {pdfJobStatusTone.label}
                        </div>
                    </div>

                    {pdfGenerationJob.passageNumber && pdfGenerationJob.totalPassages ? (
                        <div
                            style={{
                                borderRadius: 14,
                                padding: '10px 12px',
                                background: '#f8fafc',
                                border: '1px solid #e2e8f0',
                            }}
                        >
                            <div style={{ color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                Passage
                            </div>
                            <div style={{ color: '#0f172a', fontWeight: 800, marginTop: 2 }}>
                                {pdfGenerationJob.passageNumber}/{pdfGenerationJob.totalPassages}
                            </div>
                        </div>
                    ) : null}
                </div>

                {pdfGenerationJob.status === 'completed' && pdfGenerationJob.examId ? (
                    <div style={{ marginTop: 16 }}>
                        <Button
                            type="primary"
                            icon={<EyeOutlined />}
                            onClick={() => {
                                pdfGenerationJobStore.clear();
                                navigate(`/admin/exams/${pdfGenerationJob.examId}`);
                            }}
                            style={{
                                width: '100%',
                                height: 44,
                                border: 'none',
                                borderRadius: 14,
                                fontSize: '0.95rem',
                                fontWeight: 800,
                                background: 'linear-gradient(135deg, #166534 0%, #16a34a 52%, #22c55e 100%)',
                                boxShadow: '0 14px 28px rgba(22, 163, 74, 0.24)',
                            }}
                        >
                            Mở đề vừa tạo
                        </Button>
                    </div>
                ) : null}
            </div>
        </div>
    );
};
