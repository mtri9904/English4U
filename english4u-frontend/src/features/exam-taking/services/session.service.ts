import { callApi } from '@/apis/handleApi';
import { ApiRouters } from '@/constants/api-routes';
import type { PagedResult } from '@/types/api.types';
import type {
    PracticeSessionDto,
    PracticeSessionHighlightDto,
    PracticeSessionListItemDto,
    PracticeSessionPagedRequest,
    PracticeSessionResultDto,
    PracticeSessionSpeakingUploadResultDto,
    PracticeSessionStartDto,
    UploadPracticeSpeakingRecordingDto,
    UpdatePracticeSessionAnswersDto,
    UpdatePracticeSessionHighlightsDto,
} from '../types/session.types';

export type StartExamVariables = string | { examId: string; forceNew?: boolean };
const SPEAKING_SCORING_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Session Service
 * Centralizes all exam runner & taking API operations
 * Follows enterprise pattern from Mebifarm CMS (web)
 */
export const sessionService = {
    getMyExams: async (params?: PracticeSessionPagedRequest): Promise<PagedResult<PracticeSessionListItemDto>> => {
        return callApi<PagedResult<PracticeSessionListItemDto>>(
            ApiRouters.PRACTICE.MY_EXAMS,
            undefined,
            'get',
            undefined,
            { params }
        );
    },

    startExam: async (variables: StartExamVariables): Promise<PracticeSessionStartDto> => {
        const examId = typeof variables === 'string' ? variables : variables.examId;
        const forceNew = typeof variables === 'string' ? false : variables.forceNew === true;
        return callApi<PracticeSessionStartDto>(
            ApiRouters.PRACTICE.START_EXAM(examId),
            undefined,
            'post',
            undefined,
            { params: forceNew ? { forceNew: true } : undefined }
        );
    },

    getSession: async (sessionId: string): Promise<PracticeSessionDto> => {
        return callApi<PracticeSessionDto>(
            ApiRouters.SESSION.BY_ID(sessionId),
            undefined,
            'get',
            undefined,
            { timeout: 60 * 1000 }
        );
    },

    updateAnswers: async ({
        sessionId,
        data,
    }: {
        sessionId: string;
        data: UpdatePracticeSessionAnswersDto;
    }): Promise<void> => {
        return callApi<void>(
            ApiRouters.SESSION.ANSWERS(sessionId),
            data,
            'patch',
            undefined,
            { timeout: 60 * 1000 }
        );
    },

    getHighlights: async (sessionId: string): Promise<PracticeSessionHighlightDto[]> => {
        return callApi<PracticeSessionHighlightDto[]>(
            ApiRouters.SESSION.HIGHLIGHTS(sessionId),
            undefined,
            'get',
            undefined,
            { timeout: 60 * 1000 }
        );
    },

    updateHighlights: async ({
        sessionId,
        data,
    }: {
        sessionId: string;
        data: UpdatePracticeSessionHighlightsDto;
    }): Promise<PracticeSessionHighlightDto[]> => {
        return callApi<PracticeSessionHighlightDto[]>(
            ApiRouters.SESSION.HIGHLIGHTS(sessionId),
            data,
            'patch',
            undefined,
            { timeout: 60 * 1000 }
        );
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
        if (data.audio) {
            formData.append('audio', data.audio);
        }
        if (data.audioUrl != null) {
            formData.append('audioUrl', data.audioUrl);
        }
        if (data.fileSizeKB != null) {
            formData.append('fileSizeKB', String(data.fileSizeKB));
        }
        if (data.answerText != null) {
            formData.append('answerText', data.answerText);
        }
        if (data.durationSeconds != null) {
            formData.append('durationSeconds', String(data.durationSeconds));
        }

        return callApi<PracticeSessionSpeakingUploadResultDto>(
            ApiRouters.SESSION.SPEAKING_RECORDINGS(sessionId),
            formData,
            'post',
            undefined,
            {
                headers: { 'Content-Type': 'multipart/form-data' },
                timeout: SPEAKING_SCORING_TIMEOUT_MS,
            }
        );
    },

    submitReadingListening: async (sessionId: string): Promise<PracticeSessionResultDto> => {
        return callApi<PracticeSessionResultDto>(
            ApiRouters.SESSION.SUBMIT_READING_LISTENING(sessionId),
            undefined,
            'post'
        );
    },

    submitWriting: async (sessionId: string): Promise<PracticeSessionResultDto> => {
        return callApi<PracticeSessionResultDto>(
            ApiRouters.SESSION.SUBMIT_WRITING(sessionId),
            undefined,
            'post',
            undefined,
            { timeout: 5 * 60 * 1000 }
        );
    },

    submitSpeaking: async (sessionId: string): Promise<PracticeSessionResultDto> => {
        return callApi<PracticeSessionResultDto>(
            ApiRouters.SESSION.SUBMIT_SPEAKING(sessionId),
            undefined,
            'post',
            undefined,
            { timeout: SPEAKING_SCORING_TIMEOUT_MS }
        );
    },

    rescoreSpeaking: async (sessionId: string): Promise<PracticeSessionResultDto> => {
        return callApi<PracticeSessionResultDto>(
            ApiRouters.SESSION.RESCORE_SPEAKING(sessionId),
            undefined,
            'post',
            undefined,
            { timeout: SPEAKING_SCORING_TIMEOUT_MS }
        );
    },
};

// Aliases for backwards compatibility
export const sessionApi = sessionService;

