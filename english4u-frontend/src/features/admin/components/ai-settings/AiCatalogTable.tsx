import React, { useMemo } from 'react';
import { Table } from 'antd';
import { createTablePagination } from '@/components/AppPagination';
import { createAiCatalogColumns } from '../../configs/aiCatalog.columns';
import type { GeminiModelDto, AiFeatureConfigDto } from '../../types/aiSettings.types';

export interface AiCatalogTableProps {
    models: GeminiModelDto[];
    features: AiFeatureConfigDto[];
    isLoading: boolean;
    page: number;
    pageSize: number;
    totalItems: number;
    onPageChange: (page: number, pageSize: number) => void;
}

export const AiCatalogTable: React.FC<AiCatalogTableProps> = ({
    models,
    features,
    isLoading,
    page,
    pageSize,
    totalItems,
    onPageChange,
}) => {
    const columns = useMemo(() => createAiCatalogColumns(features), [features]);

    return (
        <Table
            columns={columns}
            dataSource={models}
            rowKey="id"
            loading={isLoading}
            pagination={createTablePagination({
                current: page,
                pageSize,
                total: totalItems,
                onChange: onPageChange,
                pageSizeOptions: ['10', '20', '50', '100'],
                entityLabel: 'model',
                showSizeChanger: true,
            })}
            bordered
            scroll={{ x: 1000 }}
        />
    );
};
