import { axiosInstance } from '@/apis/axios.instance';
import { useQuery } from '@tanstack/react-query';
import type {
    PracticeExamDetailDto,
    PracticeExamListItemDto,
} from '../types/practice.types';

export const practiceKeys = {
    all: ['client', 'practice', 'exams'] as const,
    detail: (id: string) => ['client', 'practice', 'exams', id] as const,
};

export const practiceApi = {
    getAll: async (): Promise<PracticeExamListItemDto[]> => {
        const response = await axiosInstance.get<PracticeExamListItemDto[]>('/practice/exams');
        return response.data;
    },
    getDetail: async (id: string): Promise<PracticeExamDetailDto> => {
        const response = await axiosInstance.get<PracticeExamDetailDto>(`/practice/exams/${id}`, {
            timeout: 30 * 1000,
        });
        return response.data;
    },
};

export const usePracticeExamsQuery = () =>
    useQuery({
        queryKey: practiceKeys.all,
        queryFn: practiceApi.getAll,
    });

export const usePracticeExamDetailQuery = (id: string) =>
    useQuery({
        queryKey: practiceKeys.detail(id),
        queryFn: () => practiceApi.getDetail(id),
        enabled: !!id,
        retry: false,
    });
