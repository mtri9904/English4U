import React, { useMemo } from 'react';
import { Table, Avatar, Card } from 'antd';
import { createTablePagination } from '@/components/AppPagination';
import type { LeaderboardItem } from '../types/leaderboard.types';
import { createLeaderboardColumns } from '../configs/leaderboard.columns';

interface LeaderboardTableProps {
    items: LeaderboardItem[];
    currentUserRank?: LeaderboardItem | null;
}

export const LeaderboardTable: React.FC<LeaderboardTableProps> = ({ items, currentUserRank }) => {
    // Only display from rank 4 onwards in the table, as 1, 2, 3 are on the podium!
    const tableData = useMemo(() => items.filter((x) => x.rank > 3), [items]);

    const columns = useMemo(() => createLeaderboardColumns(), []);

    if (tableData.length === 0) {
        return (
            <Card
                bordered={false}
                style={{
                    background: '#fff',
                    borderRadius: '16px',
                    boxShadow: '0 4px 16px rgba(15, 23, 42, 0.05)',
                    border: '1px solid #f1f5f9',
                }}
                styles={{ body: { padding: '36px 24px', textAlign: 'center' } }}
            >
                <div style={{ fontSize: '36px', marginBottom: '8px' }}>🎉</div>
                <div style={{ fontWeight: 700, fontSize: '16px', color: '#1e293b' }}>
                    Tất cả học viên hiện tại đều đang có mặt trên Bục Vinh Danh Top 3!
                </div>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '6px' }}>
                    Hãy hoàn thành thêm bài thi và nhiệm vụ tuần để vươn lên vị trí dẫn đầu.
                </div>
            </Card>
        );
    }

    return (
        <div>
            <Card
                bordered={false}
                style={{
                    borderRadius: '16px',
                    background: '#fff',
                    boxShadow: '0 4px 16px rgba(15, 23, 42, 0.05)',
                    border: '1px solid #f1f5f9',
                }}
                styles={{ body: { padding: '20px 24px' } }}
            >
                <Table
                    dataSource={tableData}
                    columns={columns}
                    rowKey="userId"
                    scroll={{ x: 750 }}
                    pagination={
                        tableData.length > 10
                            ? createTablePagination({
                                  total: tableData.length,
                                  pageSize: 10,
                                  showSizeChanger: false,
                                  entityLabel: 'học viên',
                              })
                            : false
                    }
                    rowClassName={(record) => (record.isCurrentUser ? 'current-user-row' : '')}
                />
            </Card>

            {/* Sticky Current User Bar if current user rank is > 3 */}
            {currentUserRank && currentUserRank.rank > 3 && (
                <div
                    style={{
                        marginTop: '16px',
                        padding: '14px 20px',
                        background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                        borderRadius: '14px',
                        border: '2px solid #93c5fd',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        boxShadow: '0 6px 18px rgba(37, 99, 235, 0.12)',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div
                            style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '50%',
                                background: '#2563eb',
                                color: '#fff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 800,
                                fontSize: '14px',
                            }}
                        >
                            #{currentUserRank.rank}
                        </div>
                        <Avatar src={currentUserRank.avatarUrl} size={42} style={{ backgroundColor: '#2563eb' }}>
                            {currentUserRank.displayName?.charAt(0)?.toUpperCase() || 'U'}
                        </Avatar>
                        <div>
                            <div style={{ fontWeight: 700, color: '#1e3a8a', fontSize: '15px' }}>
                                Vị trí của bạn: {currentUserRank.displayName}
                            </div>
                            <div style={{ fontSize: '12px', color: '#3b82f6', fontWeight: 500 }}>
                                {currentUserRank.secondaryMetricLabel}
                            </div>
                        </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 800, fontSize: '18px', color: '#1e40af' }}>
                            {currentUserRank.primaryMetricLabel}
                        </div>
                        <div style={{ fontSize: '12px', color: '#b45309', fontWeight: 700 }}>
                            ⚡ {currentUserRank.experiencePoints} XP
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
