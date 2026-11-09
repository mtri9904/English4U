import React, { useState, useMemo } from 'react';
import {
    Row,
    Col,
    Alert,
    Space,
    Button,
    Spin,
    Input,
    Segmented,
    Tag,
    Badge,
    Typography,
    Empty,
} from 'antd';
import {
    SaveOutlined,
    UndoOutlined,
    SearchOutlined,
    CheckCircleOutlined,
    WarningOutlined,
    ThunderboltOutlined,
    AppstoreOutlined,
} from '@ant-design/icons';
import { AiFeatureCard, type ModelSelectOption } from './AiFeatureCard';
import {
    FEATURE_GROUPS,
    FEATURE_METADATA,
} from '../../constants/aiSettings.constants';
import type { AiFeatureConfigDto, GeminiModelDto } from '../../types/aiSettings.types';

const { Text, Title } = Typography;

export interface AiFeaturesMappingTabProps {
    features: AiFeatureConfigDto[];
    formValues: Record<string, { primary: string; fallbacks: string[] }>;
    modelLookup: Map<string, GeminiModelDto>;
    modelSelectOptions: ModelSelectOption[];
    isLoading: boolean;
    isSaving: boolean;
    onPrimaryChange: (featureKey: string, newPrimary: string) => void;
    onFallbacksChange: (featureKey: string, newFallbacks: string[]) => void;
    onReset: () => void;
    onSaveAll: () => void;
}

export const AiFeaturesMappingTab: React.FC<AiFeaturesMappingTabProps> = ({
    features,
    formValues,
    modelLookup,
    modelSelectOptions,
    isLoading,
    isSaving,
    onPrimaryChange,
    onFallbacksChange,
    onReset,
    onSaveAll,
}) => {
    const [selectedGroup, setSelectedGroup] = useState<string>('all');
    const [featureSearch, setFeatureSearch] = useState<string>('');

    // Compute changes / dirty state compared to initial features config
    const dirtyCount = useMemo(() => {
        let count = 0;
        features.forEach((f) => {
            const current = formValues[f.key];
            if (!current) return;

            const primaryChanged = current.primary !== f.primaryModel;
            const fallbackChanged =
                current.fallbacks.length !== f.fallbackModels.length ||
                current.fallbacks.some((fb, i) => fb !== f.fallbackModels[i]);

            if (primaryChanged || fallbackChanged) {
                count++;
            }
        });
        return count;
    }, [features, formValues]);

    // Unique primary models in use
    const uniquePrimaryModels = useMemo(() => {
        const set = new Set<string>();
        Object.values(formValues).forEach((val) => {
            if (val.primary) set.add(val.primary);
        });
        return set.size;
    }, [formValues]);

    // Features with fallbacks configured
    const featuresWithFallbacks = useMemo(() => {
        return Object.values(formValues).filter((val) => val.fallbacks && val.fallbacks.length > 0).length;
    }, [formValues]);

    // Filter features by group and search query
    const filteredFeatures = useMemo(() => {
        return features.filter((feature) => {
            const meta = FEATURE_METADATA[feature.key];
            const matchGroup = selectedGroup === 'all' || meta?.groupId === selectedGroup;

            if (!matchGroup) return false;

            if (!featureSearch.trim()) return true;

            const q = featureSearch.trim().toLowerCase();
            const currentVal = formValues[feature.key];

            return (
                feature.name.toLowerCase().includes(q) ||
                feature.key.toLowerCase().includes(q) ||
                feature.description.toLowerCase().includes(q) ||
                (meta?.tag && meta.tag.toLowerCase().includes(q)) ||
                (currentVal?.primary && currentVal.primary.toLowerCase().includes(q))
            );
        });
    }, [features, selectedGroup, featureSearch, formValues]);

    // Group features by domain for the "all" view
    const groupedSections = useMemo(() => {
        if (selectedGroup !== 'all' || featureSearch.trim()) {
            return [{ group: null, items: filteredFeatures }];
        }

        return FEATURE_GROUPS.map((group) => ({
            group,
            items: filteredFeatures.filter((f) => FEATURE_METADATA[f.key]?.groupId === group.id),
        })).filter((sec) => sec.items.length > 0);
    }, [filteredFeatures, selectedGroup, featureSearch]);

    if (isLoading) {
        return (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
                <Spin size="large" tip="Đang tải danh mục cấu hình AI..." />
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Top Architecture Alert */}
            <Alert
                type="info"
                showIcon
                message={
                    <Space size={8}>
                        <Text strong style={{ fontSize: 14 }}>
                            Kiến trúc Hot-Reloading & Tự động Failover Chống nghẽn
                        </Text>
                        <Tag color="processing" style={{ borderRadius: 6, margin: 0 }}>
                            Tức thời
                        </Tag>
                    </Space>
                }
                description={
                    <div style={{ marginTop: 4, lineHeight: 1.6, fontSize: 13 }}>
                        Mọi thay đổi Model được áp dụng ngay lập tức cho các lượt gọi AI của học sinh mà <b>không cần khởi động lại máy chủ</b>.
                        Khi Model Chính bị vượt hạn mức (Lỗi <b>429 Quota Exceeded / Rate Limit</b>), hệ thống sẽ <b>tự động failover tức thì</b> sang danh sách
                        Model Dự phòng theo đúng thứ tự ưu tiên đã thiết lập bên dưới.
                    </div>
                }
                style={{
                    borderRadius: 12,
                    border: '1px solid #91caff',
                    background: 'linear-gradient(135deg, #e6f4ff 0%, #f0f5ff 100%)',
                }}
            />

            {/* Quick Stats Summary Pills */}
            <Row gutter={[12, 12]}>
                <Col xs={12} sm={6}>
                    <div
                        style={{
                            padding: '12px 16px',
                            background: '#fff',
                            border: '1px solid #f0f0f0',
                            borderRadius: 10,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
                        }}
                    >
                        <div
                            style={{
                                width: 36,
                                height: 36,
                                borderRadius: 8,
                                background: '#e6f4ff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#1677ff',
                                fontSize: 18,
                            }}
                        >
                            <AppstoreOutlined />
                        </div>
                        <div>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                Tổng tính năng
                            </Text>
                            <div style={{ fontSize: 18, fontWeight: 700, color: '#1f1f1f' }}>
                                {features.length}
                            </div>
                        </div>
                    </div>
                </Col>

                <Col xs={12} sm={6}>
                    <div
                        style={{
                            padding: '12px 16px',
                            background: '#fff',
                            border: '1px solid #f0f0f0',
                            borderRadius: 10,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
                        }}
                    >
                        <div
                            style={{
                                width: 36,
                                height: 36,
                                borderRadius: 8,
                                background: '#f6ffed',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#52c41a',
                                fontSize: 18,
                            }}
                        >
                            <ThunderboltOutlined />
                        </div>
                        <div>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                Model chính đang dùng
                            </Text>
                            <div style={{ fontSize: 18, fontWeight: 700, color: '#389e0d' }}>
                                {uniquePrimaryModels} Model
                            </div>
                        </div>
                    </div>
                </Col>

                <Col xs={12} sm={6}>
                    <div
                        style={{
                            padding: '12px 16px',
                            background: '#fff',
                            border: '1px solid #f0f0f0',
                            borderRadius: 10,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
                        }}
                    >
                        <div
                            style={{
                                width: 36,
                                height: 36,
                                borderRadius: 8,
                                background: featuresWithFallbacks === features.length ? '#f6ffed' : '#fffbe6',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: featuresWithFallbacks === features.length ? '#52c41a' : '#d48806',
                                fontSize: 18,
                            }}
                        >
                            {featuresWithFallbacks === features.length ? <CheckCircleOutlined /> : <WarningOutlined />}
                        </div>
                        <div>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                Đã bật Dự phòng
                            </Text>
                            <div style={{ fontSize: 18, fontWeight: 700, color: '#1f1f1f' }}>
                                {featuresWithFallbacks}/{features.length}
                            </div>
                        </div>
                    </div>
                </Col>

                <Col xs={12} sm={6}>
                    <div
                        style={{
                            padding: '12px 16px',
                            background: '#fff',
                            border: '1px solid #f0f0f0',
                            borderRadius: 10,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
                        }}
                    >
                        <div
                            style={{
                                width: 36,
                                height: 36,
                                borderRadius: 8,
                                background: dirtyCount > 0 ? '#fff2e8' : '#f0f0f0',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: dirtyCount > 0 ? '#fa541c' : '#8c8c8c',
                                fontSize: 18,
                            }}
                        >
                            <SaveOutlined />
                        </div>
                        <div>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                Trạng thái thay đổi
                            </Text>
                            <div style={{ fontSize: 14, fontWeight: 600, color: dirtyCount > 0 ? '#fa541c' : '#52c41a' }}>
                                {dirtyCount > 0 ? `${dirtyCount} chưa lưu` : 'Đã đồng bộ'}
                            </div>
                        </div>
                    </div>
                </Col>
            </Row>

            {/* Interactive Domain Filter & Search Bar */}
            <div
                style={{
                    padding: '16px 20px',
                    background: '#fff',
                    borderRadius: 12,
                    border: '1px solid #e8e8e8',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                    {/* Domain Segmented Control */}
                    <Segmented
                        value={selectedGroup}
                        onChange={(val) => setSelectedGroup(val as string)}
                        options={[
                            {
                                label: `Tất cả (${features.length})`,
                                value: 'all',
                                icon: <AppstoreOutlined />,
                            },
                            {
                                label: '🎯 Chấm thi',
                                value: 'assessment',
                            },
                            {
                                label: '🤖 Trợ lý AI',
                                value: 'copilot',
                            },
                            {
                                label: '👁️ OCR & PDF',
                                value: 'extraction',
                            },
                            {
                                label: '🎧 Nghe - Nói',
                                value: 'audio',
                            },
                            {
                                label: '📚 Học liệu',
                                value: 'content',
                            },
                        ]}
                    />

                    {/* Search Input */}
                    <Input
                        placeholder="Tìm kiếm tính năng, mã key hoặc model..."
                        prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                        value={featureSearch}
                        onChange={(e) => setFeatureSearch(e.target.value)}
                        allowClear
                        style={{ width: 280 }}
                    />
                </div>
            </div>

            {/* Features Card Listing */}
            {filteredFeatures.length === 0 ? (
                <div style={{ padding: '40px 0', background: '#fff', borderRadius: 12, border: '1px solid #f0f0f0' }}>
                    <Empty description="Không tìm thấy tính năng AI nào phù hợp với bộ lọc hiện tại." />
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
                    {groupedSections.map((sec, secIdx) => (
                        <div key={sec.group?.id || `sec-${secIdx}`} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            {/* Section Header (Only shown when grouped) */}
                            {sec.group && (
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 10,
                                        padding: '4px 2px',
                                        borderBottom: '2px solid #f0f0f0',
                                        paddingBottom: 8,
                                    }}
                                >
                                    <div
                                        style={{
                                            width: 28,
                                            height: 28,
                                            borderRadius: 6,
                                            background: sec.group.color,
                                            color: '#fff',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: 14,
                                        }}
                                    >
                                        {sec.group.icon}
                                    </div>
                                    <div>
                                        <Title level={5} style={{ margin: 0, fontSize: 16, color: '#1f1f1f' }}>
                                            {sec.group.title}
                                        </Title>
                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                            {sec.group.description}
                                        </Text>
                                    </div>
                                    <Tag color={sec.group.tagColor} style={{ marginLeft: 'auto', borderRadius: 6 }}>
                                        {sec.items.length} chức năng
                                    </Tag>
                                </div>
                            )}

                            {/* Feature Cards Grid */}
                            <Row gutter={[16, 16]}>
                                {sec.items.map((feature: AiFeatureConfigDto) => {
                                    const currentVal = formValues[feature.key] || {
                                        primary: feature.primaryModel,
                                        fallbacks: feature.fallbackModels,
                                    };

                                    return (
                                        <Col xs={24} lg={12} key={feature.key}>
                                            <AiFeatureCard
                                                feature={feature}
                                                primaryModel={currentVal.primary}
                                                fallbackModels={currentVal.fallbacks}
                                                modelLookup={modelLookup}
                                                modelSelectOptions={modelSelectOptions}
                                                onPrimaryChange={(val) => onPrimaryChange(feature.key, val)}
                                                onFallbacksChange={(vals) => onFallbacksChange(feature.key, vals)}
                                            />
                                        </Col>
                                    );
                                })}
                            </Row>
                        </div>
                    ))}
                </div>
            )}

            {/* Save Button Bar (Sticky Bottom) */}
            <div
                style={{
                    position: 'sticky',
                    bottom: 12,
                    zIndex: 10,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '16px 24px',
                    background: 'rgba(255, 255, 255, 0.95)',
                    backdropFilter: 'blur(8px)',
                    borderRadius: 14,
                    border: '1px solid #d9d9d9',
                    boxShadow: '0 6px 20px rgba(0, 0, 0, 0.08)',
                    marginTop: 10,
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Badge status={dirtyCount > 0 ? 'warning' : 'success'} />
                    <span style={{ fontSize: 13, color: '#595959' }}>
                        {dirtyCount > 0 ? (
                            <span>
                                Đang có <b style={{ color: '#fa541c' }}>{dirtyCount}</b> thay đổi chưa lưu
                            </span>
                        ) : (
                            <span style={{ color: '#52c41a' }}>Tất cả cấu hình tính năng đã được lưu mới nhất</span>
                        )}
                    </span>
                </div>

                <Space size={12}>
                    <Button
                        icon={<UndoOutlined />}
                        onClick={onReset}
                        disabled={isSaving || dirtyCount === 0}
                    >
                        Khôi phục
                    </Button>
                    <Button
                        type="primary"
                        icon={<SaveOutlined />}
                        size="large"
                        loading={isSaving}
                        onClick={onSaveAll}
                        style={{
                            background: dirtyCount > 0
                                ? 'linear-gradient(135deg, #1677ff 0%, #52c41a 100%)'
                                : undefined,
                            borderColor: '#1677ff',
                            padding: '0 24px',
                            fontWeight: 600,
                            boxShadow: dirtyCount > 0 ? '0 4px 12px rgba(22, 119, 255, 0.3)' : undefined,
                        }}
                    >
                        Lưu tất cả cấu hình
                    </Button>
                </Space>
            </div>
        </div>
    );
};
