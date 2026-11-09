import type { ColumnsType } from 'antd/es/table';
import { Space, Typography, Tag } from 'antd';
import { getFeatureIcon, getCategoryTagColor } from '../constants/aiSettings.constants';
import type { GeminiModelDto, AiFeatureConfigDto } from '../types/aiSettings.types';

const { Text } = Typography;

const getSortValue = (v: number | null | undefined): number => {
    if (v === -1) return Number.MAX_SAFE_INTEGER;
    return v ?? -Infinity;
};

export const createAiCatalogColumns = (features: AiFeatureConfigDto[]): ColumnsType<GeminiModelDto> => [
    {
        title: 'Model',
        key: 'model',
        width: 250,
        render: (_, record: GeminiModelDto) => (
            <Space direction="vertical" size={2}>
                <Text strong style={{ fontSize: 14 }}>
                    {record.displayName}
                </Text>
                <Text type="secondary" code style={{ fontSize: 12 }}>
                    {record.id}
                </Text>
            </Space>
        ),
    },
    {
        title: 'Phân loại (Category)',
        dataIndex: 'category',
        key: 'category',
        width: 170,
        render: (cat?: string) => {
            const category = cat || 'Text-out models';
            const color = getCategoryTagColor(category);
            return <Tag color={color}>{category}</Tag>;
        },
    },
    {
        title: 'RPM (Req/phút)',
        dataIndex: 'rpm',
        key: 'rpm',
        width: 140,
        sorter: (a: GeminiModelDto, b: GeminiModelDto) => getSortValue(a.rpm) - getSortValue(b.rpm),
        render: (val: number | null | undefined) => {
            if (val == null) return <Text type="secondary">-</Text>;
            if (val === -1) return <Tag color="purple">Unlimited</Tag>;
            const color = val >= 6000 ? 'green' : val >= 1000 ? 'cyan' : 'orange';
            return <Tag color={color}>{val.toLocaleString()}</Tag>;
        },
    },
    {
        title: 'TPM (Tokens/phút)',
        dataIndex: 'tpm',
        key: 'tpm',
        width: 140,
        sorter: (a: GeminiModelDto, b: GeminiModelDto) => getSortValue(a.tpm) - getSortValue(b.tpm),
        render: (val: number | null | undefined) => {
            if (val == null) return <Text type="secondary">-</Text>;
            if (val === -1) return <Tag color="purple">Unlimited</Tag>;
            if (val >= 1000000) return <Text strong>{(val / 1000000).toLocaleString()}M</Text>;
            return <Text strong>{(val / 1000).toLocaleString()}k</Text>;
        },
    },
    {
        title: 'RPD (Req/ngày)',
        dataIndex: 'rpd',
        key: 'rpd',
        width: 140,
        sorter: (a: GeminiModelDto, b: GeminiModelDto) => getSortValue(a.rpd) - getSortValue(b.rpd),
        render: (val: number | null | undefined) => {
            if (val == null) return <Text type="secondary">-</Text>;
            if (val === -1) return <Tag color="purple">Unlimited</Tag>;
            return <Text>{val.toLocaleString()}</Text>;
        },
    },
    {
        title: 'Tính năng đang dùng',
        key: 'activeFeatures',
        width: 200,
        render: (_, record: GeminiModelDto) => {
            const assigned = record.activeFeatures || [];
            if (assigned.length === 0) return <Text type="secondary">-</Text>;
            return (
                <Space size={[4, 6]} wrap>
                    {assigned.map((key: string) => {
                        const feat = features.find((f: AiFeatureConfigDto) => f.key === key);
                        return (
                            <Tag key={key} color="blue" icon={getFeatureIcon(key)}>
                                {feat ? feat.name.split('(')[0].trim() : key}
                            </Tag>
                        );
                    })}
                </Space>
            );
        },
    },
    {
        title: 'Token Giới hạn',
        key: 'tokens',
        width: 160,
        render: (_, record: GeminiModelDto) => (
            <Space direction="vertical" size={2}>
                <Text style={{ fontSize: 12 }}>
                    In: <b>{(record.inputTokenLimit ?? 0).toLocaleString()}</b>
                </Text>
                <Text style={{ fontSize: 12 }}>
                    Out: <b>{(record.outputTokenLimit ?? 0).toLocaleString()}</b>
                </Text>
            </Space>
        ),
    },
];

