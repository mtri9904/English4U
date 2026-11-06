import { useEffect, useRef, useCallback } from 'react';
import { REALTIME_BROWSER_EVENT } from '@/features/realtime/hooks/useRealtimeSync';
import { examApi } from '@/features/exams/hooks/useExamQueries';
import {
    pdfGenerationJobStore,
    usePdfGenerationJobStore,
    formatPdfGenerationErrorMessage,
    type PdfJobStatus,
    type PdfGenerationJobState,
} from '../pdfGenerationJob.store';
import {
    mapProgressStatus,
    normalizeGuidLike,
    type PdfGenerationProgressPayload,
    type RealtimeEnvelope,
} from './pdfProgress.utils';

const WATCHDOG_CHECK_INTERVAL_MS = 4_000;
const WATCHDOG_TIMEOUT_THRESHOLD_MS = 8_000;

export const usePdfGenerationSync = () => {
    const { job: pdfGenerationJob, isCollapsed } = usePdfGenerationJobStore();
    const jobRef = useRef<PdfGenerationJobState | null>(pdfGenerationJob);
    jobRef.current = pdfGenerationJob;

    const lastEventTimeRef = useRef<number>(Date.now());

    // 0. Auto-discover active server job on fresh mount (new tab / cleared session)
    useEffect(() => {
        if (jobRef.current) return;
        const token = localStorage.getItem('accessToken');
        if (!token) return;

        let disposed = false;
        const discoverActiveJob = async () => {
            try {
                const active = await examApi.getActivePdfGenerationJob();
                if (disposed || !active || jobRef.current) return;

                const mappedStatus = mapProgressStatus(active.status);
                if (mappedStatus === 'processing') {
                    pdfGenerationJobStore.setJob({
                        clientRequestId: active.clientRequestId ?? null,
                        uploadId: active.uploadId ?? null,
                        fileName: 'uploaded.pdf',
                        status: mappedStatus,
                        progressPercent: Math.max(0, Math.min(100, active.progressPercent ?? 0)),
                        stage: active.stage ?? 'processing',
                        message: active.message ? formatPdfGenerationErrorMessage(active.message) : 'Đang xử lý PDF.',
                        examId: active.examId ?? null,
                        passageNumber: active.passageNumber ?? null,
                        totalPassages: active.totalPassages ?? null,
                    });
                }
            } catch {
                // Silently ignore if not authorized or offline
            }
        };

        void discoverActiveJob();

        return () => {
            disposed = true;
        };
    }, []);

    const triggerRetry = useCallback(async (file: File) => {
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
    }, []);

    // 1. Realtime WebSocket listener (Primary fast-path)
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
            const activeJob = jobRef.current;
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

            // Mark timestamp of received socket event to keep watchdog quiet
            lastEventTimeRef.current = Date.now();

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

    // 2. Auto-retry on 503 overload errors
    const jobStatus = pdfGenerationJob?.status;
    const jobMessage = pdfGenerationJob?.message;
    useEffect(() => {
        if (
            jobStatus === 'failed' &&
            (jobMessage?.includes('503') || jobMessage?.includes('Gemini native PDF extraction failed'))
        ) {
            const store = pdfGenerationJobStore.getState();
            if (store.file && store.retryCount < 3 && !store.isRetrying) {
                void triggerRetry(store.file);
            }
        }
    }, [jobMessage, jobStatus, triggerRetry]);

    // 3. Watchdog Fallback & Initial Mount Recovery (F5 friendly, 0 spam)
    useEffect(() => {
        if (jobStatus !== 'processing') {
            return;
        }

        let disposed = false;

        const fetchLatestSnapshot = async () => {
            const currentJob = jobRef.current;
            const clientRequestId = currentJob?.clientRequestId?.trim() || null;
            const uploadId = currentJob?.uploadId?.trim() || null;

            if (!clientRequestId && !uploadId) {
                return;
            }

            try {
                const snapshot = await examApi.getPdfGenerationProgress({ clientRequestId, uploadId });
                if (disposed) return;

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
            } catch {
                // Ignore transient network errors during fallback probe
            }
        };

        // Call once on mount / status transition to immediately sync state after F5
        void fetchLatestSnapshot();

        // Watchdog interval: only queries if NO realtime event arrived for >= WATCHDOG_TIMEOUT_THRESHOLD_MS
        const watchdogInterval = window.setInterval(() => {
            if (disposed) return;

            const timeSinceLastEvent = Date.now() - lastEventTimeRef.current;
            if (timeSinceLastEvent >= WATCHDOG_TIMEOUT_THRESHOLD_MS) {
                lastEventTimeRef.current = Date.now();
                void fetchLatestSnapshot();
            }
        }, WATCHDOG_CHECK_INTERVAL_MS);

        return () => {
            disposed = true;
            window.clearInterval(watchdogInterval);
        };
    }, [jobStatus]);

    return {
        job: pdfGenerationJob,
        isCollapsed,
    };
};
