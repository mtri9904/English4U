import { axiosInstance } from '@/apis/axios.instance';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ExamDto, CreateExamDto } from '../types/exam.types';

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
        const res = await axiosInstance.get<ExamDto>(`/exam/${id}`);
        return res.data;
    },
    create: async (data: CreateExamDto): Promise<{ id: string }> => {
        const res = await axiosInstance.post<{ id: string }>('/exam', data);
        return res.data;
    },
    update: async ({ id, data }: { id: string; data: CreateExamDto }): Promise<void> => {
        await axiosInstance.put(`/exam/${id}`, data);
    },
    delete: async (id: string): Promise<void> => {
        await axiosInstance.delete(`/exam/${id}`);
    },
    uploadPdf: async ({ file, userId }: { file: File; userId: string }): Promise<{ examId: string; message: string }> => {
        const form = new FormData();
        form.append('file', file);
        const res = await axiosInstance.post<{ examId: string; message: string }>(
            '/exam/upload-pdf',
            form,
            {
                headers: { 'Content-Type': 'multipart/form-data', 'X-User-Id': userId },
                timeout: 600_000,
            }
        );
        return res.data;
    },
    updateStatus: async ({ id, isPublished }: { id: string; isPublished: boolean }): Promise<void> => {
        await axiosInstance.patch(`/exam/${id}/publish`, { isPublished });
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

export const useUploadPdfExamMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: examApi.uploadPdf,
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
