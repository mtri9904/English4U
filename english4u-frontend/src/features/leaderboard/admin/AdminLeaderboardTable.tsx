import React, { useState, useMemo } from 'react';
import { Table, Input, Card } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { createTablePagination } from '@/components/AppPagination';
import type { LeaderboardItem } from '../types/leaderboard.types';
import { createAdminLeaderboardColumns } from '../configs/adminLeaderboard.columns';

interface AdminLeaderboardTableProps {
    items: LeaderboardItem[];
}

export const AdminLeaderboardTable: React.FC<AdminLeaderboardTableProps> = ({ items }) => {
    const [searchText, setSearchText] = useState('');
    const navigate = useNavigate();

    const filteredItems = useMemo(() => {
        if (!searchText.trim()) return items;
        const q = searchText.toLowerCase();
        return items.filter(
            (item) =>
                item.displayName.toLowerCase().includes(q) ||
                item.email.toLowerCase().includes(q) ||
                (item.topBadge && item.topBadge.toLowerCase().includes(q))
        );
    }, [items, searchText]);

    const columns = useMemo(
        () =>
            createAdminLeaderboardColumns({
                onViewUserDetail: () => navigate('/admin/users'),
            }),
        [navigate]
    );

    return (
        <Card
            bordered={false}
            style={{
                borderRadius: '16px',
                background: '#fff',
                boxShadow: '0 4px 16px rgba(15, 23, 42, 0.05)',
                border: '1px solid #e2e8f0',
            }}
            styles={{ body: { padding: '20px 24px' } }}
        >
            {/* Table Search & Filter Bar */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                    marginBottom: '20px',
                }}
            >
                <Input
                    placeholder="Tìm theo tên học viên, email hoặc danh hiệu..."
                    prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    allowClear
                    style={{ maxWidth: '380px', borderRadius: '10px' }}
                />
                <span style={{ fontSize: '13px', color: '#64748b' }}>
                    Hiển thị <strong>{filteredItems.length}</strong> / <strong>{items.length}</strong> học viên
                </span>
            </div>

            <Table
                dataSource={filteredItems}
                columns={columns}
                rowKey="userId"
                scroll={{ x: 850 }}
                pagination={createTablePagination({
                    total: filteredItems.length,
                    pageSize: 10,
                    pageSizeOptions: ['10', '20', '50'],
                    showSizeChanger: true,
                    entityLabel: 'học viên',
                })}
            />
        </Card>
    );
};
