import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { markRealtimeScopeInvalidated } from '@/features/realtime/hooks/useRealtimeSync';
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
    stats: () => [...examQueryKeys.all, 'stats'] as const,
    lists: (params?: ExamPagedRequest) =>
        params ? ([...examQueryKeys.all, 'list', params] as const) : ([...examQueryKeys.all, 'list'] as const),
    detail: (id: string) => ['exams', id] as const,
    practiceAll: ['client', 'practice', 'exams'] as const,
    practiceList: (params?: PracticeExamPagedRequest) =>
        params ? ([...examQueryKeys.practiceAll, 'list', params] as const) : ([...examQueryKeys.practiceAll, 'list'] as const),
    practiceDetail: (id: string) => ['client', 'practice', 'exams', id] as const,
    myPracticeStats: () => ['practice', 'my-exams', 'stats'] as const,
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

export const useExamStatsQuery = (options?: { refetchInterval?: number }) =>
    useQuery({
        queryKey: examQueryKeys.stats(),
        queryFn: examService.getStats,
        ...options,
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

export const useMyPracticeStatsQuery = () =>
    useQuery({
        queryKey: examQueryKeys.myPracticeStats(),
        queryFn: examService.getMyPracticeStats,
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
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: examQueryKeys.lists() });
            queryClient.invalidateQueries({ queryKey: examQueryKeys.stats() });
        },
    });
};

export const useUpdateExamMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: CreateExamDto }) =>
            examService.update({ id, data }),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: examQueryKeys.lists() });
            queryClient.invalidateQueries({ queryKey: examQueryKeys.stats() });
            queryClient.invalidateQueries({
                queryKey: examQueryKeys.detail(variables.id),
                exact: true,
                refetchType: 'none',
            });
        },
    });
};

export const useDeleteExamMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: examService.delete,
        onMutate: () => {
            markRealtimeScopeInvalidated('exams.changed');
        },
        onSuccess: () => {
            markRealtimeScopeInvalidated('exams.changed');
            queryClient.invalidateQueries({ queryKey: examQueryKeys.lists() });
            queryClient.invalidateQueries({ queryKey: examQueryKeys.stats() });
        },
    });
};

export const useUpdateExamStatusMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: examService.updateStatus,
        onMutate: () => {
            markRealtimeScopeInvalidated('exams.changed');
        },
        onSuccess: (_, variables) => {
            markRealtimeScopeInvalidated('exams.changed');
            queryClient.invalidateQueries({ queryKey: examQueryKeys.lists() });
            queryClient.invalidateQueries({ queryKey: examQueryKeys.stats() });
            queryClient.invalidateQueries({
                queryKey: examQueryKeys.detail(variables.id),
                exact: true,
                refetchType: 'none',
            });
        },
    });
};

export const useGenerateExamFromPdfMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: examService.generateFromPdf,
        onMutate: () => {
            markRealtimeScopeInvalidated('exams.changed');
        },
        onSuccess: (result) => {
            markRealtimeScopeInvalidated('exams.changed');
            queryClient.invalidateQueries({ queryKey: examQueryKeys.all });
            queryClient.invalidateQueries({ queryKey: examQueryKeys.detail(result.examId) });
        },
    });
};

export const useGenerateExamAiMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: examService.generateAi,
        onMutate: () => {
            markRealtimeScopeInvalidated('exams.changed');
        },
        onSuccess: (result) => {
            markRealtimeScopeInvalidated('exams.changed');
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
