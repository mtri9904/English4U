import { useEffect } from 'react';
import { REALTIME_BROWSER_EVENT } from '@/features/realtime/hooks/useRealtimeSync';
import { examApi } from '@/features/exams/hooks/useExamQueries';
import {
    pdfGenerationJobStore,
    usePdfGenerationJobStore,
    formatPdfGenerationErrorMessage,
    type PdfJobStatus,
} from '../pdfGenerationJob.store';
import {
    mapProgressStatus,
    normalizeGuidLike,
    type PdfGenerationProgressPayload,
    type RealtimeEnvelope,
} from './pdfProgress.utils';

export const usePdfGenerationSync = () => {
    const { job: pdfGenerationJob, isCollapsed } = usePdfGenerationJobStore();

    const triggerRetry = async (file: File) => {
        const store = pdfGenerationJobStore.getState();
        if (store.isRetrying || store.retryCount >= 3) {
            return false;
        }

        pdfGenerationJobStore.setIsRetrying(true);

        const nextRetryCount = store.retryCount + 1;
        pdfGenerationJobStore.incrementRetry();
        const nextClientRequestId = crypto.randomUUID();

        pdfGenerationJobStore.updateJob((prev) => {
            if (!prev) return null;
            return {
                ...prev,
                clientRequestId: nextClientRequestId,
                uploadId: null,
                status: 'processing',
                progressPercent: 5,
                stage: 'retrying',
                message: `Hệ thống quá tải. Đang tự động thử lại lần ${nextRetryCount}/3...`,
            };
        });

        try {
            const result = await examApi.generateFromPdf({ file, clientRequestId: nextClientRequestId });
            pdfGenerationJobStore.updateJob((prev) => {
                if (!prev || prev.clientRequestId !== nextClientRequestId) return prev;
                return {
                    ...prev,
                    uploadId: result.uploadId,
                    totalPassages: result.passageCount,
                };
            });
            return true;
        } catch (err: any) {
            const apiMessage = err?.response?.data?.message;
            const fallbackMessage = formatPdfGenerationErrorMessage(
                typeof apiMessage === 'string' ? apiMessage : 'Tự động thử lại thất bại.'
            );
            pdfGenerationJobStore.updateJob((prev) => {
                if (!prev || prev.clientRequestId !== nextClientRequestId) return prev;
                return {
                    ...prev,
                    status: 'failed',
                    stage: 'failed',
                    message: fallbackMessage,
                };
            });
            return false;
        } finally {
            pdfGenerationJobStore.setIsRetrying(false);
        }
    };

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

            const hasActiveJob = !!activeJob;
            let isAllowed = false;
            if (hasActiveJob) {
                isAllowed = isSameClientRequest || isSameUpload || shouldBindPendingJob || shouldAdoptFirstProgressEvent;
            } else {
                isAllowed = isSameUser;
            }

            if (!isAllowed) {
                return;
            }

            const normalizedStatus: PdfJobStatus =
                payload.status === 'completed'
                    ? 'completed'
                    : payload.status === 'failed'
                        ? 'failed'
                        : 'processing';

            pdfGenerationJobStore.updateJob((previous) => {
                if (!previous) {
                    return {
                        clientRequestId: eventClientRequestId,
                        uploadId: payload.uploadId ?? null,
                        fileName: 'uploaded.pdf',
                        status: normalizedStatus,
                        progressPercent: Math.max(0, Math.min(100, payload.progressPercent ?? 0)),
                        stage: payload.stage ?? 'processing',
                        message: payload.message ? formatPdfGenerationErrorMessage(payload.message) : 'Đang xử lý PDF.',
                        examId: payload.examId ?? null,
                        passageNumber: payload.passageNumber ?? null,
                        totalPassages: payload.totalPassages ?? null,
                    };
                }

                const activeClientRequestIdLocal = previous.clientRequestId?.trim() || null;
                const activeUploadIdLocal = normalizeGuidLike(previous.uploadId);
                const isMatch = (!!eventClientRequestId && activeClientRequestIdLocal === eventClientRequestId) ||
                                (!!eventUploadId && activeUploadIdLocal === eventUploadId);

                if (!isMatch) {
                    return previous;
                }

                const previousUploadId = normalizeGuidLike(previous.uploadId);
                if (
                    previousUploadId &&
                    eventUploadId &&
                    previousUploadId !== eventUploadId &&
                    previous.status === 'processing'
                ) {
                    return previous;
                }

                return {
                    clientRequestId: eventClientRequestId ?? previous.clientRequestId ?? null,
                    uploadId: payload.uploadId ?? previous.uploadId ?? null,
                    fileName: previous.fileName ?? 'uploaded.pdf',
                    status: normalizedStatus,
                    progressPercent: Math.max(0, Math.min(100, payload.progressPercent ?? previous.progressPercent ?? 0)),
                    stage: payload.stage ?? previous.stage ?? 'processing',
                    message: payload.message ? formatPdfGenerationErrorMessage(payload.message) : (previous.message ?? 'Đang xử lý PDF.'),
                    examId: payload.examId ?? previous.examId ?? null,
                    passageNumber: payload.passageNumber ?? previous.passageNumber ?? null,
                    totalPassages: payload.totalPassages ?? previous.totalPassages ?? null,
                };
            });
        };

        window.addEventListener(REALTIME_BROWSER_EVENT, handleRealtimeEvent as EventListener);
        return () => {
            window.removeEventListener(REALTIME_BROWSER_EVENT, handleRealtimeEvent as EventListener);
        };
    }, []);

    useEffect(() => {
        if (!pdfGenerationJob) return;

        if (
            pdfGenerationJob.status === 'failed' &&
            (pdfGenerationJob.message?.includes('503') || pdfGenerationJob.message?.includes('Gemini native PDF extraction failed'))
        ) {
            const store = pdfGenerationJobStore.getState();
            if (store.file && store.retryCount < 3 && !store.isRetrying) {
                void triggerRetry(store.file);
            }
        }
    }, [pdfGenerationJob?.status, pdfGenerationJob?.message]);

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

                const mappedStatus = mapProgressStatus(snapshot.status);

                pdfGenerationJobStore.updateJob((previous) => {
                    if (!previous) return null;

                    const activeClientRequestId = previous.clientRequestId?.trim() || null;
                    const activeUploadId = normalizeGuidLike(previous.uploadId);
                    const isMatch = (!!clientRequestId && activeClientRequestId === clientRequestId) ||
                                    (!!uploadId && activeUploadId === uploadId);

                    if (!isMatch) {
                        return previous;
                    }

                    return {
                        clientRequestId: snapshot.clientRequestId ?? previous.clientRequestId ?? clientRequestId,
                        uploadId: snapshot.uploadId ?? previous.uploadId ?? uploadId,
                        fileName: previous.fileName ?? 'uploaded.pdf',
                        status: mappedStatus,
                        progressPercent: Math.max(0, Math.min(100, snapshot.progressPercent ?? previous.progressPercent ?? 0)),
                        stage: snapshot.stage ?? previous.stage ?? 'processing',
                        message: snapshot.message ? formatPdfGenerationErrorMessage(snapshot.message) : (previous.message ?? 'Đang xử lý PDF.'),
                        examId: snapshot.examId ?? previous.examId ?? null,
                        passageNumber: snapshot.passageNumber ?? previous.passageNumber ?? null,
                        totalPassages: snapshot.totalPassages ?? previous.totalPassages ?? null,
                    };
                });

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

    return {
        job: pdfGenerationJob,
        isCollapsed,
    };
};

