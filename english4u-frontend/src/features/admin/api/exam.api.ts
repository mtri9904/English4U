import { axiosInstance } from '@/apis/axios.instance';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
    AlignListeningTranscriptRequestDto,
    AlignListeningTranscriptResultDto,
    ExamDto,
    CreateExamDto,
    GenerateExamFromPdfResult,
    GenerateListeningTranscriptResultDto,
    PdfGenerationProgressStatus,
    PdfQuestionGroupPreviewDto,
    PdfRawExtractionPreviewDto,
    PdfRawReviewDto,
    UploadSpeakingPromptAudioResult,
    WritingVisualExtractionResultDto,
} from '../types/exam.types';

export const examKeys = {
    all: ['exams'] as const,
    detail: (id: string) => ['exams', id] as const,
};

export const examApi = {
    getAll: async (): Promise<ExamDto[]> => {
        const res = await axiosInstance.get<ExamDto[]>('/exam');
        return res.data;
    },
    getDetail: async (id: string): Promise<ExamDto> => {
        const res = await axiosInstance.get<ExamDto>(`/exam/${id}`, {
            timeout: 60 * 1000,
        });
        return res.data;
    },
    create: async (data: CreateExamDto): Promise<{ id: string }> => {
        const res = await axiosInstance.post<{ id: string }>('/exam', data, {
            timeout: 2 * 60 * 1000,
        });
        return res.data;
    },
    update: async ({ id, data }: { id: string; data: CreateExamDto }): Promise<void> => {
        await axiosInstance.put(`/exam/${id}`, data, {
            timeout: 2 * 60 * 1000,
        });
    },
    delete: async (id: string): Promise<void> => {
        await axiosInstance.delete(`/exam/${id}`, {
            timeout: 60 * 1000,
        });
    },
    updateStatus: async ({ id, isPublished }: { id: string; isPublished: boolean }): Promise<void> => {
        await axiosInstance.patch(`/exam/${id}/publish`, { isPublished });
    },
    uploadSpeakingPromptAudio: async (file: File): Promise<UploadSpeakingPromptAudioResult> => {
        const formData = new FormData();
        formData.append('file', file);
        const res = await axiosInstance.post<UploadSpeakingPromptAudioResult>('/exam/speaking-prompt-audio', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 2 * 60 * 1000,
        });
        return res.data;
    },
    generateFromPdf: async ({ file, clientRequestId }: { file: File; clientRequestId: string }): Promise<GenerateExamFromPdfResult> => {
        const formData = new FormData();
        formData.append('file', file);
        const res = await axiosInstance.post<GenerateExamFromPdfResult>('/exam/generate-from-pdf', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
                'X-Client-Request-Id': clientRequestId,
            },
            timeout: 15 * 60 * 1000,
        });
        return res.data;
    },
    getPdfGenerationProgress: async ({ clientRequestId, uploadId }: { clientRequestId?: string | null; uploadId?: string | null }): Promise<PdfGenerationProgressStatus> => {
        const res = await axiosInstance.get<PdfGenerationProgressStatus>('/exam/generate-from-pdf/progress', {
            params: {
                clientRequestId: clientRequestId || undefined,
                uploadId: uploadId || undefined,
            },
        });
        return res.data;
    },
    previewPdfRaw: async (file: File): Promise<PdfRawExtractionPreviewDto> => {
        const formData = new FormData();
        formData.append('file', file);
        const res = await axiosInstance.post<PdfRawExtractionPreviewDto>('/exam/preview-pdf-raw', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 10 * 60 * 1000,
        });
        return res.data;
    },
    previewPdfQuestionGroups: async (file: File): Promise<PdfQuestionGroupPreviewDto> => {
        const formData = new FormData();
        formData.append('file', file);
        const res = await axiosInstance.post<PdfQuestionGroupPreviewDto>('/exam/preview-pdf-question-groups', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 10 * 60 * 1000,
        });
        return res.data;
    },
    reviewPdfRaw: async (file: File): Promise<PdfRawReviewDto> => {
        const formData = new FormData();
        formData.append('file', file);
        const res = await axiosInstance.post<PdfRawReviewDto>('/exam/review-pdf-raw', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 15 * 60 * 1000,
        });
        return res.data;
    },
    extractWritingVisualData: async ({
        imageUrl,
        promptText,
    }: {
        imageUrl: string;
        promptText?: string | null;
    }): Promise<WritingVisualExtractionResultDto> => {
        const res = await axiosInstance.post<WritingVisualExtractionResultDto>('/exam/extract-writing-visual-data', {
            imageUrl,
            promptText: promptText ?? null,
        }, {
            timeout: 2 * 60 * 1000,
        });
        return res.data;
    },
    generateListeningTranscript: async ({
        audioUrl,
        language,
    }: {
        audioUrl: string;
        language?: string | null;
    }): Promise<GenerateListeningTranscriptResultDto> => {
        const res = await axiosInstance.post<GenerateListeningTranscriptResultDto>('/exam/generate-listening-transcript', {
            audioUrl,
            language: language ?? 'en',
        }, {
            timeout: 10 * 60 * 1000,
        });
        return res.data;
    },
    alignListeningTranscript: async (data: AlignListeningTranscriptRequestDto): Promise<AlignListeningTranscriptResultDto> => {
        const res = await axiosInstance.post<AlignListeningTranscriptResultDto>('/exam/align-listening-transcript', data, {
            timeout: 10 * 60 * 1000,
        });
        return res.data;
    },
};

export const useExamsQuery = () =>
    useQuery({
        queryKey: examKeys.all,
        queryFn: examApi.getAll,
    });

export const useExamDetailQuery = (id: string) =>
    useQuery({
        queryKey: examKeys.detail(id),
        queryFn: () => examApi.getDetail(id),
        enabled: !!id,
        retry: false,
    });

export const useCreateExamMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: examApi.create,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: examKeys.all }),
    });
};

export const useUpdateExamMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: examApi.update,
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: examKeys.all });
            queryClient.invalidateQueries({ queryKey: examKeys.detail(variables.id) });
        },
    });
};

export const useDeleteExamMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: examApi.delete,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: examKeys.all }),
    });
};

export const useUpdateExamStatusMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: examApi.updateStatus,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: examKeys.all }),
    });
};

export const useGenerateExamFromPdfMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: examApi.generateFromPdf,
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: examKeys.all });
            queryClient.invalidateQueries({ queryKey: examKeys.detail(result.examId) });
        },
    });
};

export const usePreviewPdfRawMutation = () =>
    useMutation({
        mutationFn: examApi.previewPdfRaw,
    });

export const useReviewPdfRawMutation = () =>
    useMutation({
        mutationFn: examApi.reviewPdfRaw,
    });

export const useExtractWritingVisualDataMutation = () =>
    useMutation({
        mutationFn: examApi.extractWritingVisualData,
    });

export const useGenerateListeningTranscriptMutation = () =>
    useMutation({
        mutationFn: examApi.generateListeningTranscript,
    });

export const useAlignListeningTranscriptMutation = () =>
    useMutation({
        mutationFn: examApi.alignListeningTranscript,
    });
