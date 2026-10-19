import React from 'react';
import { Select, Tag, Space, Typography } from 'antd';
import { AI_MODELS, DEFAULT_AI_MODEL, type AiModelConfig } from '../constants/aiModels';

export { AI_MODELS, DEFAULT_AI_MODEL, type AiModelConfig };

const { Text } = Typography;

export interface AiModelSelectorProps {
    value?: string;
    onChange?: (value: string) => void;
    size?: 'small' | 'middle' | 'large';
    style?: React.CSSProperties;
    showLabel?: boolean;
    compact?: boolean;
}

/**
 * Component lựa chọn AI Model dùng chung TOÀN HỆ THỐNG
 * (Flashcards, Copilot, Exam Grading, IELTS Writing/Speaking, Chat...)
 */
export const AiModelSelector: React.FC<AiModelSelectorProps> = ({
    value = DEFAULT_AI_MODEL,
    onChange,
    size = 'small',
    style,
    showLabel = true,
    compact = false,
}) => {
    const selectedModel = AI_MODELS.find((m) => m.id === value) || AI_MODELS[0];

    const selectOptions = AI_MODELS.map((model) => ({
        value: model.id,
        label: (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: model.id === 'auto' ? 600 : 500 }}>
                    {model.name}
                </span>
                {model.tag && (
                    <Tag color={model.tagColor || 'default'} style={{ fontSize: '0.68rem', marginLeft: 6 }}>
                        {model.tag}
                    </Tag>
                )}
            </div>
        ),
        title: `${model.name} - ${model.description} (${model.rpd}, ${model.rpm})`,
    }));

    if (compact) {
        return (
            <Select
                size={size}
                value={value}
                onChange={onChange}
                options={selectOptions}
                style={{ width: '100%', ...style }}
            />
        );
    }

    return (
        <div
            style={{
                marginBottom: 12,
                padding: '10px 14px',
                background: '#f8fafc',
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                ...style,
            }}
        >
            {showLabel && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <Text style={{ fontSize: '0.78rem', fontWeight: 600, color: '#334155' }}>
                        🤖 Mô hình AI phục vụ (Tự động chuyển khi hết limit):
                    </Text>
                    <Space size={4}>
                        {selectedModel.tag && (
                            <Tag color={selectedModel.tagColor || 'blue'} style={{ margin: 0, fontSize: '0.7rem' }}>
                                {selectedModel.tag}
                            </Tag>
                        )}
                        <Tag color="cyan" style={{ margin: 0, fontSize: '0.7rem' }}>
                            {selectedModel.rpd}
                        </Tag>
                    </Space>
                </div>
            )}
            <Select
                size={size}
                value={value}
                onChange={onChange}
                options={selectOptions}
                style={{ width: '100%' }}
            />
            <div style={{ marginTop: 4, fontSize: '0.72rem', color: '#64748b' }}>
                {selectedModel.description}
            </div>
        </div>
    );
};
