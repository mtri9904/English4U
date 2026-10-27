import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PracticeSessionPagedRequest } from '../types/session.types';
import { sessionService, sessionApi, type StartExamVariables } from '../services/session.service';
import { userKeys } from '@/features/students';

export { sessionService, sessionApi, type StartExamVariables };

/**
 * Session Query Keys Factory
 * Matches the enterprise pattern from Mebifarm CMS (web)
 */
export const sessionQueryKeys = {
    all: ['client', 'practice', 'sessions'] as const,
    list: (params?: PracticeSessionPagedRequest) => ['client', 'practice', 'sessions', params] as const,
    detail: (sessionId: string) => ['client', 'practice', 'sessions', sessionId] as const,
    highlights: (sessionId: string) => ['client', 'practice', 'sessions', sessionId, 'highlights'] as const,
};

// Alias for backwards compatibility
export const sessionKeys = sessionQueryKeys;

// ----------------- Queries -----------------

export const useMyPracticeSessionsQuery = (params?: PracticeSessionPagedRequest) =>
    useQuery({
        queryKey: sessionQueryKeys.list(params),
        queryFn: () => sessionService.getMyExams(params),
    });

export const usePracticeSessionQuery = (sessionId: string) =>
    useQuery({
        queryKey: sessionQueryKeys.detail(sessionId),
        queryFn: () => sessionService.getSession(sessionId),
        enabled: !!sessionId,
        retry: false,
    });

export const usePracticeSessionHighlightsQuery = (sessionId: string, enabled = true) =>
    useQuery({
        queryKey: sessionQueryKeys.highlights(sessionId),
        queryFn: () => sessionService.getHighlights(sessionId),
        enabled: !!sessionId && enabled,
        retry: false,
    });

// ----------------- Mutations -----------------

export const useStartPracticeSessionMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: sessionService.startExam,
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: sessionQueryKeys.all });
            queryClient.invalidateQueries({ queryKey: sessionQueryKeys.detail(result.sessionId) });
        },
    });
};

export const useUpdatePracticeSessionAnswersMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: sessionService.updateAnswers,
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: sessionQueryKeys.all });
            if ((variables.data.answers?.length ?? 0) > 0) {
                queryClient.invalidateQueries({ queryKey: sessionQueryKeys.detail(variables.sessionId) });
            }
        },
    });
};

export const useUpdatePracticeSessionHighlightsMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: sessionService.updateHighlights,
        onSuccess: (result, variables) => {
            queryClient.setQueryData(sessionQueryKeys.highlights(variables.sessionId), result);
        },
    });
};

export const useUploadPracticeSpeakingRecordingMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: sessionService.uploadSpeakingRecording,
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: sessionQueryKeys.all });
            queryClient.invalidateQueries({ queryKey: sessionQueryKeys.detail(variables.sessionId) });
        },
    });
};

export const useSubmitReadingListeningMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: sessionService.submitReadingListening,
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: sessionQueryKeys.all });
            queryClient.invalidateQueries({ queryKey: sessionQueryKeys.detail(result.sessionId) });
            queryClient.invalidateQueries({ queryKey: userKeys.profile });
        },
    });
};

export const useSubmitWritingMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: sessionService.submitWriting,
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: sessionQueryKeys.all });
            queryClient.invalidateQueries({ queryKey: sessionQueryKeys.detail(result.sessionId) });
            queryClient.invalidateQueries({ queryKey: userKeys.profile });
        },
    });
};

export const useSubmitSpeakingMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: sessionService.submitSpeaking,
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: sessionQueryKeys.all });
            queryClient.invalidateQueries({ queryKey: sessionQueryKeys.detail(result.sessionId) });
            queryClient.invalidateQueries({ queryKey: userKeys.profile });
        },
    });
};

export const useRescoreSpeakingMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: sessionService.rescoreSpeaking,
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: sessionQueryKeys.all });
            queryClient.invalidateQueries({ queryKey: sessionQueryKeys.detail(result.sessionId) });
            queryClient.invalidateQueries({ queryKey: userKeys.profile });
        },
    });
};

