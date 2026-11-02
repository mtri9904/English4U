import React, { useMemo } from 'react';
import { Card, Empty, Table } from 'antd';
import { createTablePagination } from '@/components/AppPagination';
import { APP_EMPTY_IMAGE } from '@/components/AppEmpty';
import type { FeedbackListItem, FeedbackPagedResult } from '../../types/feedback.types';
import { createFeedbackColumns } from '../../configs/feedback.columns';

interface AdminFeedbackTableProps {
    pagedData?: FeedbackPagedResult;
    isLoading: boolean;
    page: number;
    pageSize: number;
    onPageChange: (page: number, pageSize: number) => void;
    onSelectFeedback: (item: FeedbackListItem) => void;
}

export const AdminFeedbackTable: React.FC<AdminFeedbackTableProps> = ({
    pagedData,
    isLoading,
    page,
    pageSize,
    onPageChange,
    onSelectFeedback,
}) => {
    const columns = useMemo(
        () => createFeedbackColumns({ onSelectFeedback }),
        [onSelectFeedback]
    );

    return (
        <Card
            styles={{ body: { padding: '16px 20px 20px 20px' } }}
            style={{ borderRadius: '14px', border: '1px solid #e2e8f0', background: '#fff' }}
        >
            <Table
                columns={columns}
                dataSource={pagedData?.items ?? []}
                rowKey="id"
                loading={isLoading}
                scroll={{ x: 'max-content' }}
                pagination={createTablePagination({
                    current: page,
                    pageSize: pageSize,
                    total: pagedData?.totalCount ?? 0,
                    onChange: onPageChange,
                    entityLabel: 'phản hồi',
                    showSizeChanger: true,
                })}
                locale={{
                    emptyText: (
                        <Empty
                            image={APP_EMPTY_IMAGE}
                            imageStyle={{ height: 88 }}
                            description="Không có phản hồi nào phù hợp"
                        />
                    ),
                }}
                className="custom-feedback-table"
            />
        </Card>
    );
};

