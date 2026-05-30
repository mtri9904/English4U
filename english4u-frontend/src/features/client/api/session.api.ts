import { axiosInstance } from '@/apis/axios.instance';
import { userKeys } from '@/features/admin/api/user.api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
    PracticeSessionDto,
    PracticeSessionHighlightDto,
    PracticeSessionListItemDto,
    PracticeSessionResultDto,
    PracticeSessionSpeakingUploadResultDto,
    PracticeSessionStartDto,
    UploadPracticeSpeakingRecordingDto,
    UpdatePracticeSessionAnswersDto,
    UpdatePracticeSessionHighlightsDto,
} from '../types/session.types';

export const sessionKeys = {
    all: ['client', 'practice', 'sessions'] as const,
    detail: (sessionId: string) => ['client', 'practice', 'sessions', sessionId] as const,
    highlights: (sessionId: string) => ['client', 'practice', 'sessions', sessionId, 'highlights'] as const,
};

type StartExamVariables = string | { examId: string; forceNew?: boolean };
const SPEAKING_SCORING_TIMEOUT_MS = 30 * 60 * 1000;

export const sessionApi = {
    getMyExams: async (): Promise<PracticeSessionListItemDto[]> => {
        const response = await axiosInstance.get<PracticeSessionListItemDto[]>('/practice/my-exams');
        return response.data;
    },
    startExam: async (variables: StartExamVariables): Promise<PracticeSessionStartDto> => {
        const examId = typeof variables === 'string' ? variables : variables.examId;
        const forceNew = typeof variables === 'string' ? false : variables.forceNew === true;
        const response = await axiosInstance.post<PracticeSessionStartDto>(
            `/practice/exams/${examId}/start`,
            undefined,
            { params: forceNew ? { forceNew: true } : undefined },
        );
        return response.data;
    },
    getSession: async (sessionId: string): Promise<PracticeSessionDto> => {
        const response = await axiosInstance.get<PracticeSessionDto>(`/practice/sessions/${sessionId}`, {
            timeout: 60 * 1000,
        });
        return response.data;
    },
    updateAnswers: async ({
        sessionId,
        data,
    }: {
        sessionId: string;
        data: UpdatePracticeSessionAnswersDto;
    }): Promise<void> => {
        await axiosInstance.patch(`/practice/sessions/${sessionId}/answers`, data, {
            timeout: 60 * 1000,
        });
    },
    getHighlights: async (sessionId: string): Promise<PracticeSessionHighlightDto[]> => {
        const response = await axiosInstance.get<PracticeSessionHighlightDto[]>(`/practice/sessions/${sessionId}/highlights`, {
            timeout: 60 * 1000,
        });
        return response.data;
    },
    updateHighlights: async ({
        sessionId,
        data,
    }: {
        sessionId: string;
        data: UpdatePracticeSessionHighlightsDto;
    }): Promise<PracticeSessionHighlightDto[]> => {
        const response = await axiosInstance.patch<PracticeSessionHighlightDto[]>(
            `/practice/sessions/${sessionId}/highlights`,
            data,
            { timeout: 60 * 1000 },
        );
        return response.data;
    },
    uploadSpeakingRecording: async ({
        sessionId,
        data,
    }: {
        sessionId: string;
        data: UploadPracticeSpeakingRecordingDto;
    }): Promise<PracticeSessionSpeakingUploadResultDto> => {
        const formData = new FormData();
        formData.append('speakingQuestionId', data.speakingQuestionId);
        formData.append('audio', data.audio);
        if (data.answerText != null) {
            formData.append('answerText', data.answerText);
        }
        if (data.durationSeconds != null) {
            formData.append('durationSeconds', String(data.durationSeconds));
        }

        const response = await axiosInstance.post<PracticeSessionSpeakingUploadResultDto>(
            `/practice/sessions/${sessionId}/speaking-recordings`,
            formData,
            {
                headers: { 'Content-Type': 'multipart/form-data' },
                timeout: SPEAKING_SCORING_TIMEOUT_MS,
            },
        );
        return response.data;
    },
    submitReadingListening: async (sessionId: string): Promise<PracticeSessionResultDto> => {
        const response = await axiosInstance.post<PracticeSessionResultDto>(`/practice/sessions/${sessionId}/submit-reading-listening`);
        return response.data;
    },
    submitWriting: async (sessionId: string): Promise<PracticeSessionResultDto> => {
        const response = await axiosInstance.post<PracticeSessionResultDto>(`/practice/sessions/${sessionId}/submit-writing`, undefined, {
            timeout: 5 * 60 * 1000,
        });
        return response.data;
    },
    submitSpeaking: async (sessionId: string): Promise<PracticeSessionResultDto> => {
        const response = await axiosInstance.post<PracticeSessionResultDto>(`/practice/sessions/${sessionId}/submit-speaking`, undefined, {
            timeout: SPEAKING_SCORING_TIMEOUT_MS,
        });
        return response.data;
    },
    rescoreSpeaking: async (sessionId: string): Promise<PracticeSessionResultDto> => {
        const response = await axiosInstance.post<PracticeSessionResultDto>(`/practice/sessions/${sessionId}/rescore-speaking`, undefined, {
            timeout: SPEAKING_SCORING_TIMEOUT_MS,
        });
        return response.data;
    },
};

export const useMyPracticeSessionsQuery = () =>
    useQuery({
        queryKey: sessionKeys.all,
        queryFn: sessionApi.getMyExams,
    });

export const usePracticeSessionQuery = (sessionId: string) =>
    useQuery({
        queryKey: sessionKeys.detail(sessionId),
        queryFn: () => sessionApi.getSession(sessionId),
        enabled: !!sessionId,
        retry: false,
    });

export const usePracticeSessionHighlightsQuery = (sessionId: string, enabled = true) =>
    useQuery({
        queryKey: sessionKeys.highlights(sessionId),
        queryFn: () => sessionApi.getHighlights(sessionId),
        enabled: !!sessionId && enabled,
        retry: false,
    });

export const useStartPracticeSessionMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: sessionApi.startExam,
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: sessionKeys.all });
            queryClient.invalidateQueries({ queryKey: sessionKeys.detail(result.sessionId) });
        },
    });
};

export const useUpdatePracticeSessionAnswersMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: sessionApi.updateAnswers,
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: sessionKeys.all });
            if ((variables.data.answers?.length ?? 0) > 0) {
                queryClient.invalidateQueries({ queryKey: sessionKeys.detail(variables.sessionId) });
            }
        },
    });
};

export const useUpdatePracticeSessionHighlightsMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: sessionApi.updateHighlights,
        onSuccess: (result, variables) => {
            queryClient.setQueryData(sessionKeys.highlights(variables.sessionId), result);
        },
    });
};

export const useUploadPracticeSpeakingRecordingMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: sessionApi.uploadSpeakingRecording,
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: sessionKeys.all });
            queryClient.invalidateQueries({ queryKey: sessionKeys.detail(variables.sessionId) });
        },
    });
};

export const useSubmitReadingListeningMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: sessionApi.submitReadingListening,
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: sessionKeys.all });
            queryClient.invalidateQueries({ queryKey: sessionKeys.detail(result.sessionId) });
            queryClient.invalidateQueries({ queryKey: userKeys.profile });
        },
    });
};

export const useSubmitWritingMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: sessionApi.submitWriting,
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: sessionKeys.all });
            queryClient.invalidateQueries({ queryKey: sessionKeys.detail(result.sessionId) });
            queryClient.invalidateQueries({ queryKey: userKeys.profile });
        },
    });
};

export const useSubmitSpeakingMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: sessionApi.submitSpeaking,
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: sessionKeys.all });
            queryClient.invalidateQueries({ queryKey: sessionKeys.detail(result.sessionId) });
            queryClient.invalidateQueries({ queryKey: userKeys.profile });
        },
    });
};

export const useRescoreSpeakingMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: sessionApi.rescoreSpeaking,
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: sessionKeys.all });
            queryClient.invalidateQueries({ queryKey: sessionKeys.detail(result.sessionId) });
            queryClient.invalidateQueries({ queryKey: userKeys.profile });
        },
    });
};
