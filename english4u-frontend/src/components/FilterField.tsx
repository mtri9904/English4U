import React, { useState, useEffect } from 'react';
import { Input, type InputProps } from 'antd';
import { SearchOutlined } from '@ant-design/icons';

export interface FilterFieldProps extends Omit<InputProps, 'onChange'> {
    value?: string;
    onFilterChange: (value: string) => void;
    debounceMs?: number;
    placeholder?: string;
}

/**
 * FilterField - Debounced search filter input
 * Follows the enterprise pattern from Mebifarm CMS (web)
 */
export const FilterField: React.FC<FilterFieldProps> = ({
    value: externalValue = '',
    onFilterChange,
    debounceMs = 300,
    placeholder = 'Tìm kiếm nhanh...',
    style,
    ...props
}) => {
    const [searchTerm, setSearchTerm] = useState(externalValue);

    useEffect(() => {
        setSearchTerm(externalValue);
    }, [externalValue]);

    useEffect(() => {
        const handler = setTimeout(() => {
            if (searchTerm !== externalValue) {
                onFilterChange(searchTerm);
            }
        }, debounceMs);

        return () => clearTimeout(handler);
    }, [searchTerm, debounceMs, onFilterChange, externalValue]);

    return (
        <Input
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            placeholder={placeholder}
            allowClear
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
                borderRadius: 10,
                maxWidth: 320,
                height: 38,
                borderColor: '#cbd5e1',
                ...style,
            }}
            {...props}
        />
    );
};

export default FilterField;

