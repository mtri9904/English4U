import React, { useState, useEffect, useMemo } from 'react';
import { Card, Tabs, Tag, message } from 'antd';
import { AppstoreOutlined, ThunderboltOutlined } from '@ant-design/icons';
import {
    AiSettingsHeader,
    AiFeaturesMappingTab,
    AiCatalogFilterBar,
    AiCatalogTable,
    type ModelSelectOption,
} from '../components/ai-settings';
import {
    useAiModelsCatalogQuery,
    useAiFeaturesConfigQuery,
    useUpdateAiFeaturesMutation,
} from '../hooks/useAiSettings';
import { aiSettingsService } from '../services/aiSettings.service';
import type {
    GeminiModelDto,
    AiFeatureConfigDto,
    AiFeatureUpdateItemDto,
} from '../types/aiSettings.types';

export const AiSettingsPage: React.FC = () => {
    const [page, setPage] = useState<number>(1);
    const [pageSize, setPageSize] = useState<number>(10);
    const [searchText, setSearchText] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [onlyActiveFeatures, setOnlyActiveFeatures] = useState<boolean>(false);
    const [activeTab, setActiveTab] = useState('features');
    const [formValues, setFormValues] = useState<Record<string, { primary: string; fallbacks: string[] }>>({});

    // 1. Fetch live models & quotas with server-side pagination and filters
    const {
        data: catalogData,
        isLoading: isCatalogLoading,
        isRefetching: isCatalogRefetching,
        refetch: refetchCatalog,
    } = useAiModelsCatalogQuery({
        page,
        pageSize,
        search: searchText.trim() || undefined,
        category: selectedCategory !== 'all' ? selectedCategory : undefined,
        onlyInUse: onlyActiveFeatures || undefined,
    });

    // 2. Fetch features config
    const {
        data: configData,
        isLoading: isConfigLoading,
        refetch: refetchConfig,
    } = useAiFeaturesConfigQuery();

    // 3. Mutation to update configuration
    const updateMutation = useUpdateAiFeaturesMutation();

    // Sync form values on initial load or refetch
    useEffect(() => {
        if (configData?.features) {
            const initialMap: Record<string, { primary: string; fallbacks: string[] }> = {};
            configData.features.forEach((f: AiFeatureConfigDto) => {
                initialMap[f.key] = {
                    primary: f.primaryModel,
                    fallbacks: [...f.fallbackModels],
                };
            });
            setFormValues(initialMap);
        }
    }, [configData]);

    const models = useMemo<GeminiModelDto[]>(() => catalogData?.models ?? [], [catalogData?.models]);
    const allAvailableModels = useMemo<GeminiModelDto[]>(
        () => catalogData?.allModels ?? catalogData?.models ?? [],
        [catalogData?.allModels, catalogData?.models]
    );
    const features = useMemo<AiFeatureConfigDto[]>(() => configData?.features ?? [], [configData?.features]);

    // Helper map for quick model lookups
    const modelLookup = useMemo(() => {
        const map = new Map<string, GeminiModelDto>();
        allAvailableModels.forEach((m: GeminiModelDto) => map.set(m.id.toLowerCase(), m));
        return map;
    }, [allAvailableModels]);

    const categories = useMemo(() => {
        const set = new Set<string>();
        allAvailableModels.forEach((m: GeminiModelDto) => {
            if (m.category) set.add(m.category);
        });
        return Array.from(set).sort();
    }, [allAvailableModels]);

    const handlePrimaryChange = (featureKey: string, newPrimary: string) => {
        setFormValues((prev) => {
            const current = prev[featureKey] || { primary: '', fallbacks: [] };
            const updatedFallbacks = current.fallbacks.filter((m) => m !== newPrimary);
            return {
                ...prev,
                [featureKey]: {
                    primary: newPrimary,
                    fallbacks: updatedFallbacks,
                },
            };
        });
    };

    const handleFallbacksChange = (featureKey: string, newFallbacks: string[]) => {
        setFormValues((prev) => {
            const current = prev[featureKey] || { primary: '', fallbacks: [] };
            return {
                ...prev,
                [featureKey]: {
                    ...current,
                    fallbacks: newFallbacks,
                },
            };
        });
    };

    const handleSaveAll = () => {
        const updateItems: AiFeatureUpdateItemDto[] = Object.entries(formValues).map(
            ([key, val]) => ({
                key,
                primaryModel: val.primary,
                fallbackModels: val.fallbacks,
            })
        );

        updateMutation.mutate({ features: updateItems });
    };

    const handleRefreshAll = () => {
        aiSettingsService
            .getGeminiModels({ forceRefresh: true, page, pageSize })
            .then(() => {
                refetchCatalog();
                refetchConfig();
                message.info('Đang làm mới dữ liệu từ Google...');
            })
            .catch((err: unknown) => {
                const error = err as Error;
                message.error(`Lỗi khi làm mới: ${error?.message || 'Không xác định'}`);
            });
    };

    const modelSelectOptions = useMemo<ModelSelectOption[]>(() => {
        return allAvailableModels.map((m: GeminiModelDto) => {
            const rpmLabel = m.rpm ? `${m.rpm.toLocaleString()} RPM` : '';
            const tpmLabel = m.tpm ? `${(m.tpm / 1000).toLocaleString()}k TPM` : '';
            const quotaInfo = [rpmLabel, tpmLabel].filter(Boolean).join(' • ');

            return {
                value: m.id,
                label: (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>
                            <b>{m.displayName}</b> <span style={{ color: '#8c8c8c', fontSize: 12 }}>({m.id})</span>
                        </span>
                        {quotaInfo && (
                            <Tag color="cyan" style={{ marginLeft: 8, fontSize: 11 }}>
                                {quotaInfo}
                            </Tag>
                        )}
                    </div>
                ),
            };
        });
    }, [allAvailableModels]);

    const isGlobalLoading = isCatalogLoading || isConfigLoading;

    return (
        <div style={{ padding: '4px 0 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Header Card */}
            <AiSettingsHeader
                projectId={catalogData?.projectId}
                hasQuotaAccess={catalogData?.hasQuotaAccess}
                quotaMessage={catalogData?.quotaMessage}
                isRefreshing={isCatalogRefetching}
                disabled={isGlobalLoading}
                onRefresh={handleRefreshAll}
            />

            {/* Main Tabs Card */}
            <Card style={{ borderRadius: 12, border: '1px solid #f0f0f0' }}>
                <Tabs
                    activeKey={activeTab}
                    onChange={setActiveTab}
                    items={[
                        {
                            key: 'features',
                            label: (
                                <span>
                                    <AppstoreOutlined /> Cấu hình Model theo Tính năng ({features.length})
                                </span>
                            ),
                            children: (
                                <AiFeaturesMappingTab
                                    features={features}
                                    formValues={formValues}
                                    modelLookup={modelLookup}
                                    modelSelectOptions={modelSelectOptions}
                                    isLoading={isGlobalLoading}
                                    isSaving={updateMutation.isPending}
                                    onPrimaryChange={handlePrimaryChange}
                                    onFallbacksChange={handleFallbacksChange}
                                    onReset={() => refetchConfig()}
                                    onSaveAll={handleSaveAll}
                                />
                            ),
                        },
                        {
                            key: 'catalog',
                            label: (
                                <span>
                                    <ThunderboltOutlined /> Bảng Hạn mức & Catalog Models ({catalogData?.totalItems ?? allAvailableModels.length})
                                </span>
                            ),
                            children: (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                    <AiCatalogFilterBar
                                        searchText={searchText}
                                        selectedCategory={selectedCategory}
                                        onlyActiveFeatures={onlyActiveFeatures}
                                        categories={categories}
                                        totalItems={catalogData?.totalItems ?? 0}
                                        onSearchChange={(val) => {
                                            setSearchText(val);
                                            setPage(1);
                                        }}
                                        onCategoryChange={(val) => {
                                            setSelectedCategory(val);
                                            setPage(1);
                                        }}
                                        onOnlyActiveChange={(val) => {
                                            setOnlyActiveFeatures(val);
                                            setPage(1);
                                        }}
                                    />

                                    <AiCatalogTable
                                        models={models}
                                        features={features}
                                        isLoading={isCatalogLoading || isCatalogRefetching}
                                        page={page}
                                        pageSize={pageSize}
                                        totalItems={catalogData?.totalItems ?? 0}
                                        onPageChange={(p, ps) => {
                                            setPage(p);
                                            setPageSize(ps);
                                        }}
                                    />
                                </div>
                            ),
                        },
                    ]}
                />
            </Card>
        </div>
    );
};
