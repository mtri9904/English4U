import type { ColumnsType } from 'antd/es/table';
import { Avatar, Tag, Button } from 'antd';
import {
    ThunderboltFilled,
    FireFilled,
    UserOutlined,
} from '@ant-design/icons';
import type { LeaderboardItem } from '../types/leaderboard.types';

export interface CreateAdminLeaderboardColumnsOptions {
    onViewUserDetail?: (userId: string) => void;
}

export const createAdminLeaderboardColumns = (
    options?: CreateAdminLeaderboardColumnsOptions
): ColumnsType<LeaderboardItem> => [
    {
        title: 'Hạng',
        dataIndex: 'rank',
        key: 'rank',
        width: 75,
        align: 'center',
        sorter: (a, b) => a.rank - b.rank,
        render: (rank: number) => {
            const isTop3 = rank <= 3;
            return (
                <div
                    style={{
                        width: '32px',
                        height: '32px',
                        margin: '0 auto',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        fontSize: '13px',
                        background:
                            rank === 1
                                ? 'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)'
                                : rank === 2
                                ? 'linear-gradient(135deg, #94a3b8 0%, #475569 100%)'
                                : rank === 3
                                ? 'linear-gradient(135deg, #d97706 0%, #78350f 100%)'
                                : '#f1f5f9',
                        color: isTop3 ? '#fff' : '#64748b',
                        boxShadow: isTop3 ? '0 2px 6px rgba(0,0,0,0.15)' : 'none',
                    }}
                >
                    #{rank}
                </div>
            );
        },
    },
    {
        title: 'Học viên',
        key: 'user',
        render: (_, record) => (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Avatar
                    src={record.avatarUrl}
                    size={42}
                    style={{
                        backgroundColor: record.rank === 1 ? '#f59e0b' : '#3b82f6',
                        fontWeight: 600,
                        flexShrink: 0,
                    }}
                >
                    {record.displayName?.charAt(0)?.toUpperCase() || 'U'}
                </Avatar>
                <div>
                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '14px' }}>
                        {record.displayName}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                        {record.email}
                    </div>
                    {record.topBadge && (
                        <Tag
                            color="blue"
                            style={{
                                fontSize: '10px',
                                padding: '0 6px',
                                borderRadius: '8px',
                                marginTop: '2px',
                                border: 'none',
                            }}
                        >
                            {record.topBadge}
                        </Tag>
                    )}
                </div>
            </div>
        ),
    },
    {
        title: 'Thành tích chính',
        dataIndex: 'primaryMetricLabel',
        key: 'metric',
        align: 'center',
        render: (label: string, record) => (
            <div>
                <div style={{ fontWeight: 800, fontSize: '15px', color: '#0f172a' }}>
                    {label}
                </div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>
                    {record.secondaryMetricLabel}
                </div>
            </div>
        ),
    },
    {
        title: 'Thời gian học',
        dataIndex: 'totalStudyHours',
        key: 'hours',
        align: 'center',
        sorter: (a, b) => a.totalStudyHours - b.totalStudyHours,
        render: (hours: number) => (
            <span style={{ fontWeight: 600, color: '#059669' }}>
                {hours.toFixed(1)} giờ
            </span>
        ),
    },
    {
        title: 'Bài thi hoàn thành',
        dataIndex: 'examsCompletedCount',
        key: 'exams',
        align: 'center',
        sorter: (a, b) => a.examsCompletedCount - b.examsCompletedCount,
        render: (count: number) => (
            <span style={{ fontWeight: 600, color: '#1e293b' }}>
                {count} bài
            </span>
        ),
    },
    {
        title: 'Chuỗi Streak',
        dataIndex: 'dailyStreakCount',
        key: 'streak',
        align: 'center',
        sorter: (a, b) => a.dailyStreakCount - b.dailyStreakCount,
        render: (streak: number, record) => (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                <FireFilled style={{ color: streak > 0 ? '#ea580c' : '#cbd5e1' }} />
                <span style={{ fontWeight: 700, color: streak > 0 ? '#ea580c' : '#64748b' }}>
                    {streak} ngày
                </span>
                {record.longestStreakCount > streak && (
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                        (Max: {record.longestStreakCount})
                    </span>
                )}
            </div>
        ),
    },
    {
        title: 'Band Score TB',
        dataIndex: 'averageBandScore',
        key: 'band',
        align: 'center',
        sorter: (a, b) => (a.averageBandScore ?? 0) - (b.averageBandScore ?? 0),
        render: (band: number | null) => (
            <div>
                {band && band > 0 ? (
                    <Tag color={band >= 7.0 ? 'gold' : band >= 6.0 ? 'green' : 'blue'} style={{ fontWeight: 700 }}>
                        Band {band.toFixed(1)}
                    </Tag>
                ) : (
                    <span style={{ color: '#94a3b8', fontSize: '12px' }}>Chưa có Band</span>
                )}
            </div>
        ),
    },
    {
        title: 'Điểm XP',
        dataIndex: 'experiencePoints',
        key: 'xp',
        align: 'right',
        sorter: (a, b) => a.experiencePoints - b.experiencePoints,
        render: (xp: number) => (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', fontWeight: 700, color: '#d97706' }}>
                <ThunderboltFilled />
                <span>{xp.toLocaleString()} XP</span>
            </div>
        ),
    },
    {
        title: 'Thao tác',
        key: 'action',
        align: 'center',
        width: 110,
        render: (_, record) => (
            <Button
                type="link"
                size="small"
                icon={<UserOutlined />}
                onClick={() => options?.onViewUserDetail?.(record.userId)}
            >
                Chi tiết
            </Button>
        ),
    },
];

