import React, { useState } from 'react';
import { Button } from 'antd';
import { RotateCw } from 'lucide-react';
import { useUrlFilters } from '@/shared/hooks';
import type { FeedbackListItem } from '../types/feedback.types';
import {
    useAdminFeedbackStatsQuery,
    useAdminFeedbacksQuery,
} from '../hooks/useFeedbackQueries';
import { AdminFeedbackStatsRow } from '../components/admin/AdminFeedbackStatsRow';
import { AdminFeedbackFilterBar } from '../components/admin/AdminFeedbackFilterBar';
import { AdminFeedbackTable } from '../components/admin/AdminFeedbackTable';
import { AdminFeedbackDrawer } from '../components/admin/AdminFeedbackDrawer';

interface FeedbackUrlFilters {
    search: string;
    status: string;
    type: string;
    priority: string;
    page: number;
    pageSize: number;
}

const DEFAULT_FILTERS: FeedbackUrlFilters = {
    search: '',
    status: 'ALL',
    type: 'ALL',
    priority: 'ALL',
    page: 1,
    pageSize: 10,
};

export const FeedbackManagementPage: React.FC = () => {
    const { filters, setFilter, setFilters, getSearchInputValue } = useUrlFilters<FeedbackUrlFilters>({
        defaultValues: DEFAULT_FILTERS,
        pageKey: 'page',
    });

    const [selectedFeedbackId, setSelectedFeedbackId] = useState<string | null>(null);

    const { data: stats, isLoading: isStatsLoading, refetch: refetchStats } = useAdminFeedbackStatsQuery();
    const {
        data: pagedData,
        isLoading: isListLoading,
        isFetching: isListFetching,
        refetch: refetchList,
    } = useAdminFeedbacksQuery({
        pageNumber: filters.page,
        pageSize: filters.pageSize,
        search: filters.search || undefined,
        status: filters.status !== 'ALL' ? filters.status : undefined,
        type: filters.type !== 'ALL' ? filters.type : undefined,
        priority: filters.priority !== 'ALL' ? filters.priority : undefined,
    });

    const handleRefresh = () => {
        refetchList();
        refetchStats();
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight m-0">
                        Quản lý Phản hồi & Báo lỗi
                    </h1>
                    <p className="text-sm text-slate-500 mt-1 m-0">
                        Tiếp nhận, theo dõi tiến độ và xử lý các báo cáo sự cố hoặc đóng góp từ người dùng
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        icon={<RotateCw size={14} className={isListFetching ? 'animate-spin' : ''} />}
                        onClick={handleRefresh}
                    >
                        Làm mới
                    </Button>
                </div>
            </div>

            {/* Stats Cards */}
            <AdminFeedbackStatsRow stats={stats} isLoading={isStatsLoading} />

            {/* Filter Bar */}
            <AdminFeedbackFilterBar
                filters={filters}
                setFilter={setFilter}
                getSearchInputValue={getSearchInputValue}
            />

            {/* Table */}
            <AdminFeedbackTable
                pagedData={pagedData}
                isLoading={isListLoading}
                page={filters.page}
                pageSize={filters.pageSize}
                onPageChange={(page, pageSize) => setFilters({ page, pageSize })}
                onSelectFeedback={(item: FeedbackListItem) => setSelectedFeedbackId(item.id)}
            />

            {/* Resolution Drawer */}
            <AdminFeedbackDrawer
                open={!!selectedFeedbackId}
                feedbackId={selectedFeedbackId}
                onClose={() => setSelectedFeedbackId(null)}
                onSuccess={handleRefresh}
            />
        </div>
    );
};
