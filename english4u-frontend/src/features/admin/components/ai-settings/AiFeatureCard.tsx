import React from 'react';
import { Card, Space, Typography, Tag, Select, Tooltip } from 'antd';
import {
    CrownOutlined,
    SafetyCertificateOutlined,
    CheckCircleOutlined,
    RightOutlined,
    BulbOutlined,
    ThunderboltOutlined,
    InfoCircleOutlined,
} from '@ant-design/icons';
import {
    getFeatureIcon,
    getFeatureMeta,
    getCategoryTagColor,
} from '../../constants/aiSettings.constants';
import type { AiFeatureConfigDto, GeminiModelDto } from '../../types/aiSettings.types';

const { Text, Paragraph } = Typography;

export interface ModelSelectOption {
    value: string;
    label: React.ReactNode;
}

export interface AiFeatureCardProps {
    feature: AiFeatureConfigDto;
    primaryModel: string;
    fallbackModels: string[];
    modelLookup: Map<string, GeminiModelDto>;
    modelSelectOptions: ModelSelectOption[];
    onPrimaryChange: (newPrimary: string) => void;
    onFallbacksChange: (newFallbacks: string[]) => void;
}

export const AiFeatureCard: React.FC<AiFeatureCardProps> = ({
    feature,
    primaryModel,
    fallbackModels,
    modelLookup,
    modelSelectOptions,
    onPrimaryChange,
    onFallbacksChange,
}) => {
    const meta = getFeatureMeta(feature.key);
    const activeModelMeta = modelLookup.get(primaryModel.toLowerCase());

    const formatLimit = (val?: number | null) => {
        if (!val || val <= 0) return 'N/A';
        return val >= 1000 ? `${(val / 1000).toLocaleString()}k` : val.toLocaleString();
    };

    return (
        <Card
            hoverable
            style={{
                height: '100%',
                borderRadius: 14,
                border: '1px solid #e8e8e8',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
                overflow: 'hidden',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            styles={{
                header: {
                    padding: '16px 20px',
                    borderBottom: '1px solid #f0f0f0',
                    background: `linear-gradient(180deg, rgba(255, 255, 255, 0.9) 0%, rgba(250, 250, 250, 0.6) 100%)`,
                    borderTop: `4px solid ${meta.accentColor}`,
                },
                body: {
                    padding: '18px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    flex: 1,
                },
            }}
            title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                    <div
                        style={{
                            width: 44,
                            height: 44,
                            minWidth: 44,
                            borderRadius: 12,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: `linear-gradient(135deg, ${meta.accentColor}18, ${meta.accentColor}08)`,
                            border: `1px solid ${meta.accentColor}30`,
                            fontSize: 22,
                            boxShadow: `0 2px 6px ${meta.accentColor}15`,
                        }}
                    >
                        {getFeatureIcon(feature.key)}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 2 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <Text strong style={{ fontSize: 15, color: '#1f1f1f' }}>
                                {feature.name}
                            </Text>
                            <Tag
                                color={meta.tagColor}
                                style={{
                                    margin: 0,
                                    fontSize: 11,
                                    fontWeight: 500,
                                    borderRadius: 6,
                                    padding: '0 7px',
                                }}
                            >
                                {meta.tag}
                            </Tag>
                        </div>
                        <Text type="secondary" style={{ fontSize: 12, fontFamily: 'monospace' }}>
                            {feature.key}
                        </Text>
                    </div>
                </div>
            }
            extra={
                activeModelMeta ? (
                    <Tooltip title={`Model đang hoạt động: ${activeModelMeta.displayName} (${activeModelMeta.category || 'Multi-modal'})`}>
                        <Tag
                            color="success"
                            icon={<CheckCircleOutlined />}
                            style={{
                                margin: 0,
                                borderRadius: 8,
                                padding: '3px 9px',
                                fontWeight: 500,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                            }}
                        >
                            {activeModelMeta.rpm === -1
                                ? 'Unlimited RPM'
                                : activeModelMeta.rpm
                                ? `${activeModelMeta.rpm.toLocaleString()} RPM`
                                : 'Đang kích hoạt'}
                        </Tag>
                    </Tooltip>
                ) : (
                    <Tag color="default" style={{ margin: 0, borderRadius: 8 }}>
                        Đang cấu hình
                    </Tag>
                )
            }
        >
            {/* Description */}
            <Paragraph
                type="secondary"
                style={{
                    fontSize: 13,
                    lineHeight: 1.55,
                    marginBottom: 12,
                    minHeight: 40,
                }}
            >
                {feature.description}
            </Paragraph>

            {/* AI Recommendation Pill */}
            <div
                style={{
                    padding: '8px 12px',
                    background: '#fcf8e3',
                    border: '1px solid #ffe58f',
                    borderRadius: 8,
                    fontSize: 12,
                    color: '#873800',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    marginBottom: 18,
                    lineHeight: 1.45,
                }}
            >
                <BulbOutlined style={{ color: '#d48806', marginTop: 2, flexShrink: 0 }} />
                <span>{meta.recommended}</span>
            </div>

            {/* Configuration Selectors */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
                {/* 1. Primary Model Section */}
                <div
                    style={{
                        padding: '14px',
                        background: '#f8faff',
                        border: '1px solid #d6e4ff',
                        borderRadius: 10,
                        transition: 'border-color 0.2s',
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <Space size={6}>
                            <CrownOutlined style={{ color: '#1890ff', fontSize: 14 }} />
                            <Text strong style={{ fontSize: 13, color: '#0958d9' }}>
                                Model Chính (Primary Execution)
                            </Text>
                        </Space>
                        <Tooltip title="Model nhận lệnh đầu tiên khi học sinh tương tác tính năng này.">
                            <InfoCircleOutlined style={{ color: '#8c8c8c', fontSize: 12, cursor: 'pointer' }} />
                        </Tooltip>
                    </div>

                    <Select
                        style={{ width: '100%' }}
                        value={primaryModel}
                        onChange={onPrimaryChange}
                        options={modelSelectOptions}
                        showSearch
                        size="middle"
                        placeholder="Chọn Model chính..."
                        filterOption={(input, option) => {
                            const optValue = String(option?.value ?? '').toLowerCase();
                            return optValue.includes(input.toLowerCase());
                        }}
                    />

                    {/* Primary Model Live Metadata Preview */}
                    {activeModelMeta && (
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                flexWrap: 'wrap',
                                marginTop: 10,
                                paddingTop: 8,
                                borderTop: '1px dashed #d6e4ff',
                            }}
                        >
                            <Tag color={getCategoryTagColor(activeModelMeta.category)} style={{ margin: 0, fontSize: 11, borderRadius: 4 }}>
                                {activeModelMeta.category || 'Multi-modal'}
                            </Tag>

                            <Tag color="blue" icon={<ThunderboltOutlined />} style={{ margin: 0, fontSize: 11, borderRadius: 4 }}>
                                {activeModelMeta.rpm === -1
                                    ? 'Unlimited RPM'
                                    : activeModelMeta.rpm
                                    ? `${activeModelMeta.rpm.toLocaleString()} RPM`
                                    : 'Quota N/A'}
                            </Tag>

                            {activeModelMeta.tpm && (
                                <Tag color="cyan" style={{ margin: 0, fontSize: 11, borderRadius: 4 }}>
                                    {activeModelMeta.tpm === -1 ? 'Unlimited TPM' : `${(activeModelMeta.tpm / 1000).toLocaleString()}k TPM`}
                                </Tag>
                            )}

                            {activeModelMeta.rpd && (
                                <Tag color="purple" style={{ margin: 0, fontSize: 11, borderRadius: 4 }}>
                                    {activeModelMeta.rpd === -1 ? 'Unlimited RPD' : `${activeModelMeta.rpd.toLocaleString()} RPD`}
                                </Tag>
                            )}

                            {activeModelMeta.inputTokenLimit && (
                                <span style={{ fontSize: 11, color: '#8c8c8c', marginLeft: 'auto' }}>
                                    Context: {formatLimit(activeModelMeta.inputTokenLimit)} in / {formatLimit(activeModelMeta.outputTokenLimit)} out
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {/* 2. Fallback Models Section */}
                <div
                    style={{
                        padding: '14px',
                        background: '#fafafa',
                        border: '1px solid #f0f0f0',
                        borderRadius: 10,
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <Space size={6}>
                            <SafetyCertificateOutlined style={{ color: '#52c41a', fontSize: 14 }} />
                            <Text strong style={{ fontSize: 13, color: '#262626' }}>
                                Model Dự phòng (Fallback Failover)
                            </Text>
                        </Space>
                        <Tag color={fallbackModels.length > 0 ? 'green' : 'default'} style={{ margin: 0, borderRadius: 6, fontSize: 11 }}>
                            {fallbackModels.length > 0 ? `${fallbackModels.length} dự phòng` : 'Chưa có dự phòng'}
                        </Tag>
                    </div>

                    <Select
                        mode="multiple"
                        style={{ width: '100%' }}
                        placeholder="Chọn các model dự phòng khi model chính quá tải (429 Rate Limit)..."
                        value={fallbackModels}
                        onChange={onFallbacksChange}
                        options={modelSelectOptions.filter(
                            (opt: ModelSelectOption) => opt.value !== primaryModel
                        )}
                        maxTagCount="responsive"
                        showSearch
                        filterOption={(input, option) => {
                            const optValue = String(option?.value ?? '').toLowerCase();
                            return optValue.includes(input.toLowerCase());
                        }}
                    />

                    {/* Failover Chain Flow */}
                    {fallbackModels.length > 0 && (
                        <div
                            style={{
                                marginTop: 10,
                                paddingTop: 8,
                                borderTop: '1px dashed #e8e8e8',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                overflowX: 'auto',
                                fontSize: 11,
                                color: '#595959',
                            }}
                        >
                            <span style={{ fontWeight: 600, color: '#0958d9' }}>Chuỗi chuyển hướng:</span>
                            <Tag color="blue" style={{ margin: 0, fontSize: 11, borderRadius: 4 }}>
                                {primaryModel}
                            </Tag>
                            {fallbackModels.map((fb, idx) => (
                                <React.Fragment key={fb}>
                                    <RightOutlined style={{ fontSize: 9, color: '#bfbfbf' }} />
                                    <Tag color="default" style={{ margin: 0, fontSize: 11, borderRadius: 4 }}>
                                        {idx + 1}. {fb}
                                    </Tag>
                                </React.Fragment>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </Card>
    );
};
