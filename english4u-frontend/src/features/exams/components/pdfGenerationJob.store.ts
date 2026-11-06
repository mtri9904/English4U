import { useSyncExternalStore } from 'react';

export type PdfJobStatus = 'processing' | 'completed' | 'failed';

export type PdfGenerationJobState = {
    clientRequestId: string | null;
    uploadId: string | null;
    fileName: string;
    status: PdfJobStatus;
    progressPercent: number;
    stage: string;
    message: string;
    examId: string | null;
    passageNumber: number | null;
    totalPassages: number | null;
};

type PdfGenerationStoreState = {
    job: PdfGenerationJobState | null;
    isCollapsed: boolean;
    file: File | null;
    retryCount: number;
    isRetrying: boolean;
    openUploadModalTrigger: boolean;
};

type Listener = () => void;

const PDF_JOB_STORAGE_KEY = 'english4u_active_pdf_job';

const loadPersistedJob = (): PdfGenerationJobState | null => {
    try {
        const raw = sessionStorage.getItem(PDF_JOB_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as PdfGenerationJobState;
        if (parsed && typeof parsed === 'object' && parsed.status) {
            return parsed;
        }
        return null;
    } catch {
        return null;
    }
};

const persistJob = (job: PdfGenerationJobState | null) => {
    try {
        if (!job) {
            sessionStorage.removeItem(PDF_JOB_STORAGE_KEY);
        } else {
            sessionStorage.setItem(PDF_JOB_STORAGE_KEY, JSON.stringify(job));
        }
    } catch {
        // Ignore storage write issues (e.g. private mode quota)
    }
};

const listeners = new Set<Listener>();

let storeState: PdfGenerationStoreState = {
    job: loadPersistedJob(),
    isCollapsed: false,
    file: null,
    retryCount: 0,
    isRetrying: false,
    openUploadModalTrigger: false,
};

const emitChange = () => {
    listeners.forEach((listener) => listener());
};

const setStoreState = (updater: (current: PdfGenerationStoreState) => PdfGenerationStoreState) => {
    storeState = updater(storeState);
    persistJob(storeState.job);
    emitChange();
};

const subscribe = (listener: Listener) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

const getSnapshot = () => storeState;

export const pdfGenerationJobStore = {
    subscribe,
    getSnapshot,
    getState: () => storeState,
    getJob: () => storeState.job,
    setFile: (file: File | null) => {
        setStoreState((current) => ({
            ...current,
            file,
        }));
    },
    setJob: (job: PdfGenerationJobState | null) => {
        setStoreState((current) => ({
            ...current,
            job,
            isCollapsed: false,
        }));
    },
    updateJob: (updater: (current: PdfGenerationJobState | null) => PdfGenerationJobState | null) => {
        setStoreState((current) => ({
            ...current,
            job: updater(current.job),
        }));
    },
    setCollapsed: (isCollapsed: boolean) => {
        setStoreState((current) => ({
            ...current,
            isCollapsed: current.job ? isCollapsed : false,
        }));
    },
    incrementRetry: () => {
        setStoreState((current) => ({
            ...current,
            retryCount: current.retryCount + 1,
        }));
    },
    resetRetry: () => {
        setStoreState((current) => ({
            ...current,
            retryCount: 0,
        }));
    },
    setIsRetrying: (isRetrying: boolean) => {
        setStoreState((current) => ({
            ...current,
            isRetrying,
        }));
    },
    setOpenUploadModalTrigger: (openUploadModalTrigger: boolean) => {
        setStoreState((current) => ({
            ...current,
            openUploadModalTrigger,
        }));
    },
    cancelJob: () => {
        storeState = {
            job: null,
            isCollapsed: false,
            file: null,
            retryCount: 0,
            isRetrying: false,
            openUploadModalTrigger: false,
        };
        persistJob(null);
        emitChange();
    },
    clear: () => {
        storeState = {
            job: null,
            isCollapsed: false,
            file: null,
            retryCount: 0,
            isRetrying: false,
            openUploadModalTrigger: false,
        };
        persistJob(null);
        emitChange();
    },
};

export const usePdfGenerationJobStore = () =>
    useSyncExternalStore(pdfGenerationJobStore.subscribe, pdfGenerationJobStore.getSnapshot, pdfGenerationJobStore.getSnapshot);

export const formatPdfGenerationErrorMessage = (message?: string | null): string => {
    if (!message) return 'Tạo đề từ PDF thất bại.';
    const lowerMessage = message.toLowerCase();
    if (
        lowerMessage.includes('copyright') ||
        lowerMessage.includes('safety') ||
        lowerMessage.includes('blocked') ||
        lowerMessage.includes('policy') ||
        lowerMessage.includes('recitation') ||
        lowerMessage.includes('bản quyền') ||
        lowerMessage.includes('chính sách')
    ) {
        return 'Nội dung tệp PDF bị từ chối do vi phạm bản quyền hoặc chính sách an toàn của AI.';
    }
    return message;
};
