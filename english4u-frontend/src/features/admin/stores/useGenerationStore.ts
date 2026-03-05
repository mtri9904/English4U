import { create } from 'zustand';

type GenerationStatus = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

interface PassageProgress {
    index: number;
    total: number;
}

interface GenerationState {
    status: GenerationStatus;
    fileName: string;
    progress: number;
    passageProgress: PassageProgress | null;
    statusText: string;
    examId: string | null;
    errorMessage: string | null;
    widgetVisible: boolean;
    widgetMinimized: boolean;
    abortController: AbortController | null;

    startGeneration: (fileName: string) => void;
    setUploading: () => void;
    setProcessing: (text: string) => void;
    setPassageProgress: (index: number, total: number) => void;
    setProgress: (percent: number) => void;
    setDone: (examId: string) => void;
    setError: (message: string) => void;
    reset: () => void;
    setWidgetMinimized: (val: boolean) => void;
    dismissWidget: () => void;
    setAbortController: (ctrl: AbortController | null) => void;
}

export const useGenerationStore = create<GenerationState>((set) => ({
    status: 'idle',
    fileName: '',
    progress: 0,
    passageProgress: null,
    statusText: '',
    examId: null,
    errorMessage: null,
    widgetVisible: false,
    widgetMinimized: false,
    abortController: null,

    startGeneration: (fileName) =>
        set({
            status: 'uploading',
            fileName,
            progress: 0,
            passageProgress: null,
            statusText: 'Đang tải file lên...',
            examId: null,
            errorMessage: null,
            widgetVisible: true,
            widgetMinimized: false,
        }),

    setUploading: () =>
        set({ status: 'uploading', statusText: 'Đang tải file lên...' }),

    setProcessing: (text) =>
        set({ status: 'processing', statusText: text }),

    setPassageProgress: (index, total) =>
        set({
            passageProgress: { index, total },
            progress: Math.round(((index + 1) / total) * 100),
            statusText: `Đang xử lý passage ${index + 1}/${total}...`,
        }),

    setProgress: (percent) => set({ progress: percent }),

    setDone: (examId) =>
        set({
            status: 'done',
            progress: 100,
            examId,
            statusText: 'Tạo đề thi thành công!',
        }),

    setError: (message) =>
        set({
            status: 'error',
            errorMessage: message,
            statusText: 'Xử lý thất bại',
        }),

    reset: () =>
        set({
            status: 'idle',
            fileName: '',
            progress: 0,
            passageProgress: null,
            statusText: '',
            examId: null,
            errorMessage: null,
            widgetVisible: false,
            widgetMinimized: false,
            abortController: null,
        }),

    setWidgetMinimized: (val) => set({ widgetMinimized: val }),

    dismissWidget: () => set({ widgetVisible: false }),

    setAbortController: (ctrl) => set({ abortController: ctrl }),
}));
