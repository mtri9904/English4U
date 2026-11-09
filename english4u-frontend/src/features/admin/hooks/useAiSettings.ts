import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { message } from 'antd';
import { aiSettingsService } from '../services/aiSettings.service';
import type {
    GeminiModelCatalogRequestDto,
    AiFeaturesConfigurationUpdateDto,
} from '../types/aiSettings.types';

export const useAiModelsCatalogQuery = (params: GeminiModelCatalogRequestDto) => {
    return useQuery({
        queryKey: [
            'admin-ai-models',
            params.page,
            params.pageSize,
            params.search,
            params.category,
            params.onlyInUse,
        ],
        queryFn: () => aiSettingsService.getGeminiModels(params),
        staleTime: 60_000,
    });
};

export const useAiFeaturesConfigQuery = () => {
    return useQuery({
        queryKey: ['admin-ai-features-config'],
        queryFn: () => aiSettingsService.getFeaturesConfig(),
        staleTime: 30_000,
    });
};

export const useUpdateAiFeaturesMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (payload: AiFeaturesConfigurationUpdateDto) =>
            aiSettingsService.updateFeaturesConfig(payload),
        onSuccess: () => {
            message.success('Cập nhật cấu hình AI Model thành công! Cấu hình đã được áp dụng tức thì.');
            queryClient.invalidateQueries({ queryKey: ['admin-ai-features-config'] });
            queryClient.invalidateQueries({ queryKey: ['admin-ai-models'] });
        },
        onError: (err: unknown) => {
            const error = err as Error;
            message.error(`Không thể lưu cấu hình: ${error?.message || 'Lỗi không xác định'}`);
        },
    });
};

