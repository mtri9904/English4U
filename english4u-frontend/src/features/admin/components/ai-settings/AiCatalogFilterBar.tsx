import React from 'react';
import { Row, Col, Input, Space, Typography, Select, Switch } from 'antd';
import { SearchOutlined } from '@ant-design/icons';

const { Text } = Typography;

export interface AiCatalogFilterBarProps {
    searchText: string;
    selectedCategory: string;
    onlyActiveFeatures: boolean;
    categories: string[];
    totalItems: number;
    onSearchChange: (value: string) => void;
    onCategoryChange: (value: string) => void;
    onOnlyActiveChange: (value: boolean) => void;
}

export const AiCatalogFilterBar: React.FC<AiCatalogFilterBarProps> = ({
    searchText,
    selectedCategory,
    onlyActiveFeatures,
    categories,
    totalItems,
    onSearchChange,
    onCategoryChange,
    onOnlyActiveChange,
}) => {
    return (
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
            <Col xs={24} md={9}>
                <Input
                    prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                    placeholder="Tìm kiếm model theo tên hoặc mã định danh (id)..."
                    value={searchText}
                    onChange={(e) => onSearchChange(e.target.value)}
                    allowClear
                />
            </Col>
            <Col xs={24} md={15}>
                <div
                    style={{
                        display: 'flex',
                        gap: 14,
                        justifyContent: 'flex-end',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                    }}
                >
                    <Space>
                        <Text style={{ fontSize: 13 }}>Phân loại:</Text>
                        <Select
                            value={selectedCategory}
                            onChange={onCategoryChange}
                            style={{ width: 190 }}
                            options={[
                                { label: 'Tất cả phân loại', value: 'all' },
                                ...categories.map((c: string) => ({ label: c, value: c })),
                            ]}
                        />
                    </Space>
                    <Space>
                        <Switch
                            checked={onlyActiveFeatures}
                            onChange={onOnlyActiveChange}
                            size="small"
                        />
                        <Text style={{ fontSize: 13 }}>Chỉ model đang dùng</Text>
                    </Space>
                    <Text type="secondary" style={{ marginLeft: 6 }}>
                        Tổng <b>{totalItems}</b> model
                    </Text>
                </div>
            </Col>
        </Row>
    );
};

