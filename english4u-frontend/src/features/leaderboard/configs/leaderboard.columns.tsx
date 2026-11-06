import type { ColumnsType } from 'antd/es/table';
import { Avatar, Tag } from 'antd';
import { ThunderboltFilled } from '@ant-design/icons';
import type { LeaderboardItem } from '../types/leaderboard.types';

export const createLeaderboardColumns = (): ColumnsType<LeaderboardItem> => [
    {
        title: 'Hạng',
        dataIndex: 'rank',
        key: 'rank',
        width: 70,
        align: 'center',
        render: (rank: number) => (
            <div
                style={{
                    fontWeight: 700,
                    fontSize: '15px',
                    color: rank <= 5 ? '#2563eb' : '#64748b',
                }}
            >
                #{rank}
            </div>
        ),
    },
    {
        title: 'Học viên',
        key: 'user',
        render: (_, record) => (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Avatar
                    src={record.avatarUrl}
                    size={40}
                    style={{
                        backgroundColor: record.isCurrentUser ? '#2563eb' : '#64748b',
                        fontWeight: 600,
                    }}
                >
                    {record.displayName?.charAt(0)?.toUpperCase() || 'U'}
                </Avatar>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                            style={{
                                fontWeight: record.isCurrentUser ? 700 : 600,
                                color: record.isCurrentUser ? '#1d4ed8' : '#1e293b',
                                fontSize: '14px',
                            }}
                        >
                            {record.displayName}
                        </span>
                        {record.isCurrentUser && (
                            <Tag color="blue" style={{ fontSize: '11px', margin: 0, fontWeight: 700 }}>
                                Bạn
                            </Tag>
                        )}
                    </div>
                    {record.topBadge && (
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                            {record.topBadge}
                        </div>
                    )}
                </div>
            </div>
        ),
    },
    {
        title: 'Thành tích',
        dataIndex: 'primaryMetricLabel',
        key: 'metric',
        align: 'center',
        render: (label: string) => (
            <div style={{ fontWeight: 800, fontSize: '15px', color: '#0f172a' }}>
                {label}
            </div>
        ),
    },
    {
        title: 'Chi tiết',
        dataIndex: 'secondaryMetricLabel',
        key: 'secondary',
        responsive: ['md'],
        render: (secondary: string) => (
            <div style={{ fontSize: '12px', color: '#64748b' }}>
                {secondary}
            </div>
        ),
    },
    {
        title: 'Điểm XP',
        dataIndex: 'experiencePoints',
        key: 'xp',
        align: 'right',
        render: (xp: number) => (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', fontWeight: 700, color: '#d97706' }}>
                <ThunderboltFilled />
                <span>{xp.toLocaleString()} XP</span>
            </div>
        ),
    },
];

