import React from 'react';
import { Avatar, Tag } from 'antd';
import type { LeaderboardItem } from '../types/leaderboard.types';

interface LeaderboardPodiumProps {
    topThree: LeaderboardItem[];
}

export const LeaderboardPodium: React.FC<LeaderboardPodiumProps> = ({ topThree }) => {
    if (topThree.length === 0) return null;

    const first = topThree.find((x) => x.rank === 1);
    const second = topThree.find((x) => x.rank === 2);
    const third = topThree.find((x) => x.rank === 3);

    const renderPodiumStep = (
        item: LeaderboardItem | undefined,
        rank: 1 | 2 | 3,
        height: number,
        podiumColor: string,
        gradientBorder: string,
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
                    maxWidth: isFirst ? '260px' : '220px',
                    position: 'relative',
                    zIndex: isFirst ? 2 : 1,
                }}
            >
                {/* Crown / Rank icon */}
                <div style={{ position: 'relative', marginBottom: '8px' }}>
                    {isFirst && (
                        <div
                            style={{
                                position: 'absolute',
                                top: '-28px',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                fontSize: '28px',
                                color: '#f59e0b',
                                filter: 'drop-shadow(0 4px 10px rgba(245, 158, 11, 0.6))',
                                animation: 'bounce 2s infinite',
                            }}
                        >
                            👑
                        </div>
                    )}
                    <Avatar
                        src={item.avatarUrl}
                        size={isFirst ? 84 : 70}
                        style={{
                            border: `3px solid transparent`,
                            backgroundImage: `${gradientBorder}, ${gradientBorder}`,
                            backgroundOrigin: 'border-box',
                            backgroundClip: 'content-box, border-box',
                            boxShadow: `0 12px 28px ${glowColor}`,
                            fontSize: isFirst ? '28px' : '22px',
                            fontWeight: 700,
                            backgroundColor: item.isCurrentUser ? '#2563eb' : '#475569',
                        }}
                    >
                        {item.displayName?.charAt(0)?.toUpperCase() || 'U'}
                    </Avatar>

                    {/* Rank Badge Indicator */}
                    <div
                        style={{
                            position: 'absolute',
                            bottom: '-4px',
                            right: '-4px',
                            width: isFirst ? '30px' : '26px',
                            height: isFirst ? '30px' : '26px',
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
                            boxShadow: '0 4px 8px rgba(0,0,0,0.15)',
                        }}
                    >
                        {rank}
                    </div>
                </div>

                {/* User Info */}
                <div style={{ textAlign: 'center', marginBottom: '12px' }}>
                    <div
                        style={{
                            fontWeight: 700,
                            fontSize: isFirst ? '16px' : '14px',
                            color: '#0f172a',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: isFirst ? '200px' : '160px',
                        }}
                    >
                        {item.displayName} {item.isCurrentUser && <span style={{ color: '#2563eb' }}>(Bạn)</span>}
                    </div>

                    {item.topBadge && (
                        <Tag
                            color={rank === 1 ? 'gold' : rank === 2 ? 'blue' : 'orange'}
                            style={{
                                fontSize: '11px',
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
                        background: podiumColor,
                        borderRadius: '20px 20px 0 0',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '16px 12px',
                        boxShadow: `0 10px 25px ${glowColor}`,
                        border: '1px solid rgba(255, 255, 255, 0.4)',
                        position: 'relative',
                    }}
                >
                    <div
                        style={{
                            fontSize: isFirst ? '22px' : '18px',
                            fontWeight: 800,
                            color: isFirst ? '#92400e' : rank === 2 ? '#1e293b' : '#78350f',
                            lineHeight: 1.2,
                        }}
                    >
                        {item.primaryMetricLabel}
                    </div>
                    <div
                        style={{
                            fontSize: '12px',
                            color: isFirst ? '#b45309' : rank === 2 ? '#64748b' : '#9a3412',
                            fontWeight: 600,
                            marginTop: '4px',
                            textAlign: 'center',
                        }}
                    >
                        {item.secondaryMetricLabel}
                    </div>
                    <div
                        style={{
                            marginTop: '8px',
                            fontSize: '11px',
                            padding: '2px 8px',
                            background: 'rgba(255, 255, 255, 0.6)',
                            borderRadius: '8px',
                            color: '#334155',
                            fontWeight: 600,
                        }}
                    >
                        ⚡ {item.experiencePoints} XP
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'center',
                gap: '14px',
                marginBottom: '28px',
                paddingTop: '36px',
            }}
        >
            {/* Rank 2 - Left (if present) */}
            {second &&
                renderPodiumStep(
                    second,
                    2,
                    160,
                    'linear-gradient(180deg, #f1f5f9 0%, #e2e8f0 100%)',
                    'linear-gradient(135deg, #94a3b8 0%, #cbd5e1 100%)',
                    'rgba(148, 163, 184, 0.2)'
                )}

            {/* Rank 1 - Center (Tallest) */}
            {first &&
                renderPodiumStep(
                    first,
                    1,
                    205,
                    'linear-gradient(180deg, #fef3c7 0%, #fde68a 100%)',
                    'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
                    'rgba(245, 158, 11, 0.3)'
                )}

            {/* Rank 3 - Right (if present) */}
            {third &&
                renderPodiumStep(
                    third,
                    3,
                    135,
                    'linear-gradient(180deg, #ffedd5 0%, #fed7aa 100%)',
                    'linear-gradient(135deg, #f97316 0%, #fb923c 100%)',
                    'rgba(249, 115, 22, 0.2)'
                )}
        </div>
    );
};
