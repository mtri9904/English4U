import { callApi } from '@/apis/handleApi';
import { ApiRouters } from '@/constants/api-routes';
import type { DictationExercise, DictationGenerateRequest } from '../types/dictation.types';

export const dictationService = {
    generateExercise: async (request: DictationGenerateRequest): Promise<DictationExercise> => {
        return callApi<DictationExercise>(
            ApiRouters.PRACTICE.DICTATION_GENERATE,
            request,
            'post'
        );
    },
};

