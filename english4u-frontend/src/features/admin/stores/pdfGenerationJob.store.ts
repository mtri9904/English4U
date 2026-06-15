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
};

type Listener = () => void;

const listeners = new Set<Listener>();

let storeState: PdfGenerationStoreState = {
    job: null,
    isCollapsed: false,
};

const emitChange = () => {
    listeners.forEach((listener) => listener());
};

const setStoreState = (updater: (current: PdfGenerationStoreState) => PdfGenerationStoreState) => {
    storeState = updater(storeState);
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
    setJob: (job: PdfGenerationJobState | null) => {
        setStoreState(() => ({
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
    clear: () => {
        storeState = {
            job: null,
            isCollapsed: false,
        };
        emitChange();
    },
};

export const usePdfGenerationJobStore = () =>
    useSyncExternalStore(pdfGenerationJobStore.subscribe, pdfGenerationJobStore.getSnapshot, pdfGenerationJobStore.getSnapshot);
