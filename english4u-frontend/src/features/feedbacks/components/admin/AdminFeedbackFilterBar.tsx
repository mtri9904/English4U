import React from 'react';
import { Input, Select } from 'antd';
import { Search } from 'lucide-react';

interface FeedbackUrlFilters {
    search: string;
    status: string;
    type: string;
    priority: string;
    page: number;
    pageSize?: number;
}

interface AdminFeedbackFilterBarProps {
    filters: FeedbackUrlFilters;
    setFilter: (key: keyof FeedbackUrlFilters, value: any) => void;
    getSearchInputValue: (key: keyof FeedbackUrlFilters) => string;
}

export const AdminFeedbackFilterBar: React.FC<AdminFeedbackFilterBarProps> = ({
    filters,
    setFilter,
    getSearchInputValue,
}) => {
    return (
        <div className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-sm flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[240px]">
                <Input
                    prefix={<Search size={16} className="text-slate-400 mr-1" />}
                    placeholder="Tìm theo tiêu đề hoặc mã phản hồi..."
                    value={getSearchInputValue('search')}
                    onChange={(e) => setFilter('search', e.target.value)}
                    allowClear
                />
            </div>

            <Select
                value={filters.status}
                onChange={(val) => setFilter('status', val)}
                style={{ width: 150 }}
                options={[
                    { label: 'Tất cả trạng thái', value: 'ALL' },
                    { label: 'Đã ghi nhận', value: 'RECEIVED' },
                    { label: 'Đang xử lý', value: 'IN_PROGRESS' },
                    { label: 'Đã xử lý', value: 'RESOLVED' },
                    { label: 'Từ chối', value: 'REJECTED' },
                ]}
            />

            <Select
                value={filters.type}
                onChange={(val) => setFilter('type', val)}
                style={{ width: 160 }}
                options={[
                    { label: 'Tất cả phân loại', value: 'ALL' },
                    { label: 'Sự cố / Lỗi', value: 'BUG' },
                    { label: 'Đề xuất cải tiến', value: 'IMPROVEMENT' },
                    { label: 'Câu hỏi / Thắc mắc', value: 'QUESTION' },
                    { label: 'Khác', value: 'OTHER' },
                ]}
            />

            <Select
                value={filters.priority}
                onChange={(val) => setFilter('priority', val)}
                style={{ width: 150 }}
                options={[
                    { label: 'Tất cả mức độ', value: 'ALL' },
                    { label: 'Thấp', value: 'LOW' },
                    { label: 'Trung bình', value: 'MEDIUM' },
                    { label: 'Cao', value: 'HIGH' },
                    { label: 'Khẩn cấp', value: 'URGENT' },
                ]}
            />
        </div>
    );
};

