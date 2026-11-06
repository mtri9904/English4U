import React from 'react';
import { Pagination, type PaginationProps, type TablePaginationConfig } from 'antd';

export const DEFAULT_PAGE_SIZE_OPTIONS = ['10', '20', '50', '100'];
export const DEFAULT_PAGE_SIZE = 10;
export const DEFAULT_ENTITY_LABEL = 'mục';

export const renderPaginationTotal = (
    totalNum: number,
    range: [number, number],
    entityLabel = DEFAULT_ENTITY_LABEL
) => (
    <span className="text-slate-500 text-xs sm:text-sm font-normal">
        Hiển thị {range[0]} - {range[1]} trong số{' '}
        <strong className="font-semibold text-slate-700">{totalNum}</strong> {entityLabel}
    </span>
);

export interface AppPaginationProps extends Omit<PaginationProps, 'onChange' | 'align' | 'showTotal'> {
    totalItems?: number;
    entityLabel?: string;
    align?: 'left' | 'center' | 'right' | 'between';
    showTotal?: ((total: number, range: [number, number]) => React.ReactNode) | boolean;
    onChange?: (page: number, pageSize: number) => void;
}

export const AppPagination: React.FC<AppPaginationProps> = ({
    total,
    totalItems,
    current = 1,
    pageSize = DEFAULT_PAGE_SIZE,
    showSizeChanger = true,
    pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
    entityLabel = DEFAULT_ENTITY_LABEL,
    align = 'right',
    showTotal,
    style,
    className,
    onChange,
    ...props
}) => {
    const totalCount = total ?? totalItems ?? 0;
    const resolvedShowTotal =
        typeof showTotal === 'function'
            ? showTotal
            : showTotal === false
            ? undefined
            : (t: number, r: [number, number]) => renderPaginationTotal(t, r, entityLabel);

    if (align === 'between') {
        const start = totalCount > 0 ? (current - 1) * pageSize + 1 : 0;
        const end = Math.min(current * pageSize, totalCount);

        return (
            <div
                className={`p-4 flex flex-col sm:flex-row items-center justify-between gap-3 ${className || ''}`}
                style={style}
            >
                {showTotal !== false && renderPaginationTotal(totalCount, [start, end], entityLabel)}
                <Pagination
                    current={current}
                    pageSize={pageSize}
                    total={totalCount}
                    showSizeChanger={showSizeChanger}
                    pageSizeOptions={pageSizeOptions}
                    onChange={onChange}
                    {...props}
                />
            </div>
        );
    }

    const justifyClass =
        align === 'center'
            ? 'justify-center'
            : align === 'left'
            ? 'justify-start'
            : 'justify-end';

    return (
        <div className={`flex items-center ${justifyClass} py-4 px-4 sm:px-6 ${className || ''}`} style={style}>
            <Pagination
                current={current}
                pageSize={pageSize}
                total={totalCount}
                showSizeChanger={showSizeChanger}
                pageSizeOptions={pageSizeOptions}
                showTotal={resolvedShowTotal}
                onChange={onChange}
                {...props}
            />
        </div>
    );
};

export interface TablePaginationOptions {
    current?: number;
    pageSize?: number;
    total?: number;
    onChange?: (page: number, pageSize: number) => void;
    entityLabel?: string;
    pageSizeOptions?: string[];
    showSizeChanger?: boolean;
}

/**
 * Pagination configuration helper for Ant Design Table: <Table pagination={createTablePagination({...})} />
 */
export const createTablePagination = ({
    current,
    pageSize = DEFAULT_PAGE_SIZE,
    total,
    onChange,
    entityLabel = DEFAULT_ENTITY_LABEL,
    pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
    showSizeChanger = true,
}: TablePaginationOptions = {}): TablePaginationConfig => {
    const config: TablePaginationConfig = {
        pageSize,
        showSizeChanger,
        pageSizeOptions,
        showTotal: (totalNum, range) => renderPaginationTotal(totalNum, range, entityLabel),
    };

    if (current !== undefined) config.current = current;
    if (total !== undefined) config.total = total;
    if (onChange) config.onChange = onChange;

    return config;
};

export default AppPagination;
