import React from 'react';
import { Button, Input, Select } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';

export type PublishFilter = 'ALL' | 'PUBLISHED' | 'DRAFT';

interface ExamFilterBarProps {
    searchText: string;
    onSearchTextChange: (text: string) => void;
    filterSkill: string;
    onFilterSkillChange: (skill: string) => void;
    skillFilterOptions: string[];
    publishFilter: PublishFilter;
    onPublishFilterChange: (filter: PublishFilter) => void;
    hasActiveFilter: boolean;
    onResetFilters: () => void;
}

export const ExamFilterBar: React.FC<ExamFilterBarProps> = ({
    searchText,
    onSearchTextChange,
    filterSkill,
    onFilterSkillChange,
    skillFilterOptions,
    publishFilter,
    onPublishFilterChange,
    hasActiveFilter,
    onResetFilters,
}) => {
    return (
        <div
            style={{
                marginBottom: 14,
                display: 'flex',
                gap: 10,
                flexWrap: 'wrap',
                alignItems: 'center',
            }}
        >
            <Input
                value={searchText}
                onChange={(event) => onSearchTextChange(event.target.value)}
                allowClear
                prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                placeholder="Tìm theo tên đề hoặc mô tả..."
                style={{ minWidth: 250, flex: 2, borderRadius: 10 }}
            />

            <Select
                value={filterSkill}
                onChange={onFilterSkillChange}
                style={{ minWidth: 150, flex: 1 }}
                options={[
                    { value: 'ALL', label: 'Tất cả kỹ năng' },
                    ...skillFilterOptions.map((skill) => ({
                        value: skill,
                        label: skill,
                    })),
                ]}
            />
            <Select
                value={publishFilter}
                onChange={(value: PublishFilter) => onPublishFilterChange(value)}
                style={{ minWidth: 160, flex: 1 }}
                options={[
                    { value: 'ALL', label: 'Tất cả trạng thái' },
                    { value: 'PUBLISHED', label: 'Đang xuất bản' },
                    { value: 'DRAFT', label: 'Đề nháp' },
                ]}
            />
            <Button
                icon={<ReloadOutlined />}
                onClick={onResetFilters}
                disabled={!hasActiveFilter}
                style={{ borderRadius: 10 }}
            >
                Xóa lọc
            </Button>
        </div>
    );
};

