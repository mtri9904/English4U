import type { PagedResult } from '@/types/api.types';
import { callApi } from '@/apis/handleApi';
import { ApiRouters } from '@/constants/api-routes';
import type {
    ExamDto,
    CreateExamDto,
    AlignListeningTranscriptRequestDto,
    AlignListeningTranscriptResultDto,
    GenerateExamFromPdfResult,
    GenerateListeningTranscriptResultDto,
    PdfGenerationProgressStatus,
    UploadSpeakingPromptAudioResult,
    WritingVisualExtractionResultDto,
    PracticeExamListItemDto,
    PracticeExamDetailDto,
    ExamPagedRequest,
    PracticeExamPagedRequest,
} from '../types/exam.types';

/**
 * Exam Service
 * Centralizes all exam management (Admin) and exam practice/catalog (Client) API calls.
 * Follows the enterprise pattern from Mebifarm CMS (web).
 */
export const examService = {
    // ----------------- Admin Exam Operations -----------------
    getAll: async (params?: ExamPagedRequest): Promise<PagedResult<ExamDto>> => {
        return callApi<PagedResult<ExamDto>>(ApiRouters.EXAM.BASE, undefined, 'get', undefined, { params });
    },

    getDetail: async (id: string): Promise<ExamDto> => {
        return callApi<ExamDto>(ApiRouters.EXAM.BY_ID(id), undefined, 'get', undefined, {
            timeout: 60 * 1000,
        });
    },

    create: async (data: CreateExamDto): Promise<{ id: string }> => {
        return callApi<{ id: string }>(ApiRouters.EXAM.BASE, data, 'post', undefined, {
            timeout: 2 * 60 * 1000,
        });
    },

    update: async ({ id, data }: { id: string; data: CreateExamDto }): Promise<void> => {
        return callApi<void>(ApiRouters.EXAM.BY_ID(id), data, 'put', undefined, {
            timeout: 2 * 60 * 1000,
        });
    },

    delete: async (id: string): Promise<void> => {
        return callApi<void>(ApiRouters.EXAM.BY_ID(id), undefined, 'delete', undefined, {
            timeout: 60 * 1000,
        });
    },

    updateStatus: async ({ id, isPublished }: { id: string; isPublished: boolean }): Promise<void> => {
        return callApi<void>(ApiRouters.EXAM.PUBLISH(id), { isPublished }, 'patch');
    },

    // ----------------- AI & Audio Integrations -----------------
    uploadSpeakingPromptAudio: async (file: File): Promise<UploadSpeakingPromptAudioResult> => {
        const formData = new FormData();
        formData.append('file', file);
        return callApi<UploadSpeakingPromptAudioResult>(
            ApiRouters.EXAM.SPEAKING_PROMPT_AUDIO,
            formData,
            'post',
            undefined,
            {
                headers: { 'Content-Type': 'multipart/form-data' },
                timeout: 2 * 60 * 1000,
            }
        );
    },

    generateFromPdf: async ({
        file,
        clientRequestId,
    }: {
        file: File;
        clientRequestId: string;
    }): Promise<GenerateExamFromPdfResult> => {
        const formData = new FormData();
        formData.append('file', file);
        return callApi<GenerateExamFromPdfResult>(
            ApiRouters.EXAM.GENERATE_FROM_PDF,
            formData,
            'post',
            undefined,
            {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    'X-Client-Request-Id': clientRequestId,
                },
                timeout: 15 * 60 * 1000,
            }
        );
    },

    generateAi: async ({
        file,
        inputMode,
        topicDescription,
        languageCode,
        clientRequestId,
    }: {
        file?: File | null;
        inputMode: string;
        topicDescription?: string | null;
        languageCode?: string | null;
        clientRequestId: string;
    }): Promise<GenerateExamFromPdfResult> => {
        const formData = new FormData();
        if (file) {
            formData.append('file', file);
        }
        formData.append('inputMode', inputMode);
        if (topicDescription) {
            formData.append('topicDescription', topicDescription);
        }
        if (languageCode) {
            formData.append('languageCode', languageCode);
        }
        return callApi<GenerateExamFromPdfResult>(
            ApiRouters.EXAM.GENERATE_AI,
            formData,
            'post',
            undefined,
            {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    'X-Client-Request-Id': clientRequestId,
                },
                timeout: 20 * 60 * 1000,
            }
        );
    },

    getPdfGenerationProgress: async ({
        clientRequestId,
        uploadId,
    }: {
        clientRequestId?: string | null;
        uploadId?: string | null;
    }): Promise<PdfGenerationProgressStatus> => {
        return callApi<PdfGenerationProgressStatus>(
            ApiRouters.EXAM.GENERATE_PDF_PROGRESS,
            {
                clientRequestId: clientRequestId || undefined,
                uploadId: uploadId || undefined,
            },
            'get'
        );
    },

    extractWritingVisualData: async ({
        imageUrl,
        promptText,
    }: {
        imageUrl: string;
        promptText?: string | null;
    }): Promise<WritingVisualExtractionResultDto> => {
        return callApi<WritingVisualExtractionResultDto>(
            ApiRouters.EXAM.EXTRACT_WRITING_VISUAL_DATA,
            {
                imageUrl,
                promptText: promptText ?? null,
            },
            'post',
            undefined,
            {
                timeout: 2 * 60 * 1000,
            }
        );
    },

    generateListeningTranscript: async ({
        audioUrl,
        language,
    }: {
        audioUrl: string;
        language?: string | null;
    }): Promise<GenerateListeningTranscriptResultDto> => {
        return callApi<GenerateListeningTranscriptResultDto>(
            ApiRouters.EXAM.GENERATE_LISTENING_TRANSCRIPT,
            {
                audioUrl,
                language: language ?? 'en',
            },
            'post',
            undefined,
            {
                timeout: 10 * 60 * 1000,
            }
        );
    },

    alignListeningTranscript: async (
        data: AlignListeningTranscriptRequestDto
    ): Promise<AlignListeningTranscriptResultDto> => {
        return callApi<AlignListeningTranscriptResultDto>(
            ApiRouters.EXAM.ALIGN_LISTENING_TRANSCRIPT,
            data,
            'post',
            undefined,
            {
                timeout: 10 * 60 * 1000,
            }
        );
    },

    // ----------------- Client Practice Catalog Operations -----------------
    getPracticeExams: async (params?: PracticeExamPagedRequest): Promise<PagedResult<PracticeExamListItemDto>> => {
        return callApi<PagedResult<PracticeExamListItemDto>>(ApiRouters.PRACTICE.EXAMS, undefined, 'get', undefined, { params });
    },

    getPracticeExamDetail: async (id: string): Promise<PracticeExamDetailDto> => {
        return callApi<PracticeExamDetailDto>(
            ApiRouters.PRACTICE.EXAM_BY_ID(id),
            undefined,
            'get',
            undefined,
            {
                timeout: 30 * 1000,
            }
        );
    },
};

// Alias for backwards compatibility
export const examApi = examService;
export const practiceApi = {
    getAll: examService.getPracticeExams,
    getDetail: examService.getPracticeExamDetail,
};

