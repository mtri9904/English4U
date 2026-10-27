import React from 'react';
import { Pagination, type PaginationProps } from 'antd';

export interface AppPaginationProps extends PaginationProps {
    totalItems?: number;
}

/**
 * AppPagination - Standardized pagination component
 * Follows the enterprise pattern from Mebifarm CMS (web)
 */
export const AppPagination: React.FC<AppPaginationProps> = ({
    total,
    totalItems,
    current = 1,
    pageSize = 10,
    showSizeChanger = true,
    pageSizeOptions = ['10', '20', '50', '100'],
    style,
    ...props
}) => {
    const totalCount = total ?? totalItems ?? 0;

    return (
        <div
            style={{
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                padding: '16px 0',
                marginTop: 8,
                ...style,
            }}
        >
            <Pagination
                current={current}
                pageSize={pageSize}
                total={totalCount}
                showSizeChanger={showSizeChanger}
                pageSizeOptions={pageSizeOptions}
                showTotal={(totalNum, range) => (
                    <span style={{ color: '#64748b', fontSize: '0.85rem' }}>
                        Hiển thị {range[0]} - {range[1]} trong số <strong>{totalNum}</strong> mục
                    </span>
                )}
                {...props}
            />
        </div>
    );
};

export default AppPagination;

