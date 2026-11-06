import React from 'react';
import { Card, Avatar, Tag } from 'antd';
import type { LeaderboardItem } from '../types/leaderboard.types';

interface AdminLeaderboardPodiumProps {
    topThree: LeaderboardItem[];
}

export const AdminLeaderboardPodium: React.FC<AdminLeaderboardPodiumProps> = ({ topThree }) => {
    if (topThree.length === 0) return null;

    const first = topThree.find((x) => x.rank === 1);
    const second = topThree.find((x) => x.rank === 2);
    const third = topThree.find((x) => x.rank === 3);

    const renderPodiumCard = (
        item: LeaderboardItem | undefined,
        rank: 1 | 2 | 3,
        height: number,
        bgGradient: string,
        borderColor: string,
        glowColor: string
    ) => {
        if (!item) return null;

        const isFirst = rank === 1;

        return (
            <div
                key={item.userId}
                style={{
                    flex: '1 1 200px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    maxWidth: isFirst ? '280px' : '230px',
                    position: 'relative',
                    zIndex: isFirst ? 2 : 1,
                }}
            >
                {/* Crown / Rank indicator */}
                <div style={{ position: 'relative', marginBottom: '8px' }}>
                    {isFirst && (
                        <div
                            style={{
                                position: 'absolute',
                                top: '-28px',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                fontSize: '28px',
                                filter: 'drop-shadow(0 4px 10px rgba(245, 158, 11, 0.6))',
                            }}
                        >
                            👑
                        </div>
                    )}
                    <Avatar
                        src={item.avatarUrl}
                        size={isFirst ? 80 : 66}
                        style={{
                            border: `3px solid ${borderColor}`,
                            boxShadow: `0 10px 24px ${glowColor}`,
                            fontSize: isFirst ? '26px' : '20px',
                            fontWeight: 700,
                            backgroundColor: isFirst ? '#f59e0b' : rank === 2 ? '#64748b' : '#d97706',
                        }}
                    >
                        {item.displayName?.charAt(0)?.toUpperCase() || 'U'}
                    </Avatar>

                    {/* Number Badge */}
                    <div
                        style={{
                            position: 'absolute',
                            bottom: '-4px',
                            right: '-4px',
                            width: isFirst ? '28px' : '24px',
                            height: isFirst ? '28px' : '24px',
                            borderRadius: '50%',
                            background:
                                rank === 1
                                    ? 'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)'
                                    : rank === 2
                                    ? 'linear-gradient(135deg, #94a3b8 0%, #475569 100%)'
                                    : 'linear-gradient(135deg, #d97706 0%, #78350f 100%)',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800,
                            fontSize: isFirst ? '14px' : '12px',
                            border: '2px solid #fff',
                            boxShadow: '0 3px 6px rgba(0,0,0,0.15)',
                        }}
                    >
                        {rank}
                    </div>
                </div>

                {/* User Info */}
                <div style={{ textAlign: 'center', marginBottom: '10px' }}>
                    <div
                        style={{
                            fontWeight: 700,
                            fontSize: isFirst ? '15px' : '13px',
                            color: '#0f172a',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: isFirst ? '220px' : '180px',
                        }}
                    >
                        {item.displayName}
                    </div>
                    <div
                        style={{
                            fontSize: '11px',
                            color: '#64748b',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: isFirst ? '220px' : '180px',
                        }}
                    >
                        {item.email}
                    </div>
                    {item.topBadge && (
                        <Tag
                            color={rank === 1 ? 'gold' : rank === 2 ? 'blue' : 'orange'}
                            style={{
                                fontSize: '10px',
                                fontWeight: 600,
                                borderRadius: '10px',
                                margin: '4px 0 0',
                                border: 'none',
                            }}
                        >
                            {item.topBadge}
                        </Tag>
                    )}
                </div>

                {/* Podium Stand */}
                <div
                    style={{
                        width: '100%',
                        height: `${height}px`,
                        background: bgGradient,
                        borderRadius: '16px 16px 0 0',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '14px 10px',
                        boxShadow: `0 8px 20px ${glowColor}`,
                        border: `1px solid ${borderColor}`,
                    }}
                >
                    <div
                        style={{
                            fontSize: isFirst ? '20px' : '16px',
                            fontWeight: 800,
                            color: isFirst ? '#92400e' : rank === 2 ? '#1e293b' : '#78350f',
                            lineHeight: 1.2,
                        }}
                    >
                        {item.primaryMetricLabel}
                    </div>
                    <div
                        style={{
                            fontSize: '11px',
                            color: isFirst ? '#b45309' : rank === 2 ? '#64748b' : '#9a3412',
                            fontWeight: 600,
                            marginTop: '2px',
                            textAlign: 'center',
                        }}
                    >
                        {item.secondaryMetricLabel}
                    </div>
                    <div
                        style={{
                            marginTop: '6px',
                            fontSize: '11px',
                            padding: '2px 8px',
                            background: 'rgba(255, 255, 255, 0.7)',
                            borderRadius: '8px',
                            color: '#334155',
                            fontWeight: 700,
                        }}
                    >
                        ⚡ {item.experiencePoints} XP
                    </div>
                </div>
            </div>
        );
    };

    return (
        <Card
            bordered={false}
            style={{
                borderRadius: '16px',
                background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
                marginBottom: '24px',
                boxShadow: '0 4px 16px rgba(15, 23, 42, 0.05)',
                border: '1px solid #e2e8f0',
            }}
            styles={{ body: { padding: '32px 20px 0' } }}
        >
            <div style={{ textAlign: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    🏆 Bục Vinh Danh Dẫn Đầu
                </span>
            </div>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                    gap: '14px',
                    paddingTop: '32px',
                }}
            >
                {second &&
                    renderPodiumCard(
                        second,
                        2,
                        140,
                        'linear-gradient(180deg, #ffffff 0%, #e2e8f0 100%)',
                        '#cbd5e1',
                        'rgba(148, 163, 184, 0.2)'
                    )}
                {first &&
                    renderPodiumCard(
                        first,
                        1,
                        180,
                        'linear-gradient(180deg, #fffbeb 0%, #fde68a 100%)',
                        '#f59e0b',
                        'rgba(245, 158, 11, 0.3)'
                    )}
                {third &&
                    renderPodiumCard(
                        third,
                        3,
                        120,
                        'linear-gradient(180deg, #fff7ed 0%, #fed7aa 100%)',
                        '#f97316',
                        'rgba(249, 115, 22, 0.2)'
                    )}
            </div>
        </Card>
    );
};

