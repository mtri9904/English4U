import { callApi } from '@/apis/handleApi';
import { ApiRouters } from '@/constants/api-routes';
import type {
    GeminiModelCatalogResponseDto,
    GeminiModelCatalogRequestDto,
    AiFeaturesConfigurationDto,
    AiFeaturesConfigurationUpdateDto
} from '../types/aiSettings.types';

export const aiSettingsService = {
    getGeminiModels: async (params?: GeminiModelCatalogRequestDto): Promise<GeminiModelCatalogResponseDto> => {
        return callApi<GeminiModelCatalogResponseDto>(ApiRouters.ADMIN.GEMINI_MODELS, params, 'get');
    },

    getFeaturesConfig: async (): Promise<AiFeaturesConfigurationDto> => {
        return callApi<AiFeaturesConfigurationDto>(ApiRouters.ADMIN.AI_FEATURES_CONFIG, undefined, 'get');
    },

    updateFeaturesConfig: async (data: AiFeaturesConfigurationUpdateDto): Promise<AiFeaturesConfigurationDto> => {
        return callApi<AiFeaturesConfigurationDto>(ApiRouters.ADMIN.AI_FEATURES_CONFIG, data, 'put');
    },
};

