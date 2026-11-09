export interface GeminiModelDto {
    id: string;
    displayName: string;
    description: string;
    category?: string;
    inputTokenLimit?: number | null;
    outputTokenLimit?: number | null;
    rpm?: number | null;
    tpm?: number | null;
    rpd?: number | null;
    isActiveScoring: boolean;
    isActiveCopilot: boolean;
    activeFeatures: string[];
    supportedGenerationMethods: string[];
}

export interface GeminiModelCatalogRequestDto {
    page?: number;
    pageSize?: number;
    search?: string;
    category?: string;
    onlyInUse?: boolean;
    forceRefresh?: boolean;
}

export interface GeminiModelCatalogResponseDto {
    projectId: string;
    hasQuotaAccess: boolean;
    quotaMessage?: string | null;
    currentScoringModel: string;
    currentCopilotModel: string;
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    models: GeminiModelDto[];
    allModels?: GeminiModelDto[];
}

export interface AiFeatureConfigDto {
    key: string;
    name: string;
    description: string;
    primaryModel: string;
    fallbackModels: string[];
    defaultPrimaryModel: string;
}

export interface AiFeaturesConfigurationDto {
    features: AiFeatureConfigDto[];
    lastUpdatedAt?: string | null;
}

export interface AiFeatureUpdateItemDto {
    key: string;
    primaryModel: string;
    fallbackModels?: string[];
}

export interface AiFeaturesConfigurationUpdateDto {
    features: AiFeatureUpdateItemDto[];
}

