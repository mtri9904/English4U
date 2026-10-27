import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { examService, examApi } from '../services/exam.service';
import type {
    CreateExamDto,
    ExamPagedRequest,
    PracticeExamPagedRequest,
} from '../types/exam.types';

export { examService, examApi };

/**
 * Exam Query Keys Factory
 * Matches the enterprise pattern from Mebifarm CMS (web)
 */
export const examQueryKeys = {
    all: ['exams'] as const,
    lists: (params?: ExamPagedRequest) => [...examQueryKeys.all, 'list', params] as const,
    detail: (id: string) => ['exams', id] as const,
    practiceAll: ['client', 'practice', 'exams'] as const,
    practiceList: (params?: PracticeExamPagedRequest) => [...examQueryKeys.practiceAll, 'list', params] as const,
    practiceDetail: (id: string) => ['client', 'practice', 'exams', id] as const,
};

// Aliases for backwards compatibility
export const examKeys = {
    all: examQueryKeys.all,
    detail: examQueryKeys.detail,
};

export const practiceKeys = {
    all: examQueryKeys.practiceAll,
    detail: examQueryKeys.practiceDetail,
};

// ----------------- Admin Queries -----------------

export const useExamsQuery = (params?: ExamPagedRequest) =>
    useQuery({
        queryKey: examQueryKeys.lists(params),
        queryFn: () => examService.getAll(params),
    });

export const useExamDetailQuery = (id: string) =>
    useQuery({
        queryKey: examQueryKeys.detail(id),
        queryFn: () => examService.getDetail(id),
        enabled: !!id,
        retry: false,
    });

// ----------------- Client Practice Queries -----------------

export const usePracticeExamsQuery = (params?: PracticeExamPagedRequest) =>
    useQuery({
        queryKey: examQueryKeys.practiceList(params),
        queryFn: () => examService.getPracticeExams(params),
    });

export const usePracticeExamDetailQuery = (id: string) =>
    useQuery({
        queryKey: examQueryKeys.practiceDetail(id),
        queryFn: () => examService.getPracticeExamDetail(id),
        enabled: !!id,
        retry: false,
    });

// ----------------- Admin Mutations -----------------

export const useCreateExamMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: examService.create,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: examQueryKeys.all }),
    });
};

export const useUpdateExamMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: CreateExamDto }) =>
            examService.update({ id, data }),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: examQueryKeys.all });
            queryClient.invalidateQueries({ queryKey: examQueryKeys.detail(variables.id) });
        },
    });
};

export const useDeleteExamMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: examService.delete,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: examQueryKeys.all }),
    });
};

export const useUpdateExamStatusMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: examService.updateStatus,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: examQueryKeys.all }),
    });
};

export const useGenerateExamFromPdfMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: examService.generateFromPdf,
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: examQueryKeys.all });
            queryClient.invalidateQueries({ queryKey: examQueryKeys.detail(result.examId) });
        },
    });
};

export const useGenerateExamAiMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: examService.generateAi,
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: examQueryKeys.all });
            queryClient.invalidateQueries({ queryKey: examQueryKeys.detail(result.examId) });
        },
    });
};

export const useExtractWritingVisualDataMutation = () =>
    useMutation({
        mutationFn: examService.extractWritingVisualData,
    });

export const useGenerateListeningTranscriptMutation = () =>
    useMutation({
        mutationFn: examService.generateListeningTranscript,
    });

export const useAlignListeningTranscriptMutation = () =>
    useMutation({
        mutationFn: examService.alignListeningTranscript,
    });
