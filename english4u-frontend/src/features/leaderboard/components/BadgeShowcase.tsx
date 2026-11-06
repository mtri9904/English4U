import React, { useState, useMemo } from 'react';
import { Card, Progress, Radio, Tag } from 'antd';
import { CheckCircleFilled, LockFilled, ThunderboltFilled } from '@ant-design/icons';
import type { BadgeItem } from '../types/leaderboard.types';
import { getTierBadgeStyle } from '../utils/leaderboard.utils';

interface BadgeShowcaseProps {
    badges: BadgeItem[];
}

export const BadgeShowcase: React.FC<BadgeShowcaseProps> = ({ badges }) => {
    const [filter, setFilter] = useState<'all' | 'unlocked' | 'locked'>('all');

    const filteredBadges = useMemo(() => {
        if (filter === 'unlocked') return badges.filter((b) => b.unlocked);
        if (filter === 'locked') return badges.filter((b) => !b.unlocked);
        return badges;
    }, [badges, filter]);

    return (
        <div>
            {/* Header & Filter */}
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
                <div>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>
                        Bộ Sưu Tập Huy Hiệu Danh Dự 🎖️
                    </h2>
                    <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
                        Hoàn thành các cột mốc học tập để mở khóa huy hiệu danh giá và nhận thêm điểm XP thưởng!
                    </p>
                </div>

                <Radio.Group
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    buttonStyle="solid"
                >
                    <Radio.Button value="all">
                        Tất cả ({badges.length})
                    </Radio.Button>
                    <Radio.Button value="unlocked">
                        Đã đạt ({badges.filter((b) => b.unlocked).length})
                    </Radio.Button>
                    <Radio.Button value="locked">
                        Đang mở khóa ({badges.filter((b) => !b.unlocked).length})
                    </Radio.Button>
                </Radio.Group>
            </div>

            {/* Badges Grid */}
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: '18px',
                }}
            >
                {filteredBadges.map((badge) => {
                    const style = getTierBadgeStyle(badge.tier, badge.unlocked);
                    const progressPercent = Math.min(
                        100,
                        Math.round((badge.currentProgress / badge.targetProgress) * 100)
                    );

                    return (
                        <Card
                            key={badge.id}
                            bordered={false}
                            style={{
                                borderRadius: '18px',
                                border: style.border,
                                background: style.background,
                                boxShadow: style.glow,
                                transition: 'all 0.3s ease',
                                position: 'relative',
                                overflow: 'hidden',
                                filter: badge.unlocked ? 'none' : 'grayscale(0.35)',
                            }}
                            bodyStyle={{ padding: '20px' }}
                            hoverable
                        >
                            {/* Tier Badge Tag */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                                <div
                                    style={{
                                        width: '46px',
                                        height: '46px',
                                        borderRadius: '14px',
                                        background: badge.unlocked ? '#fff' : '#e2e8f0',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '24px',
                                        boxShadow: badge.unlocked ? '0 6px 14px rgba(0,0,0,0.08)' : 'none',
                                    }}
                                >
                                    {badge.icon}
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Tag
                                        style={{
                                            border: 'none',
                                            borderRadius: '10px',
                                            color: '#fff',
                                            background: style.tagBg,
                                            fontWeight: 700,
                                            fontSize: '11px',
                                            textTransform: 'uppercase',
                                        }}
                                    >
                                        {badge.tier}
                                    </Tag>
                                    <Tag
                                        color="gold"
                                        style={{
                                            margin: 0,
                                            fontWeight: 700,
                                            fontSize: '11px',
                                            borderRadius: '8px',
                                        }}
                                    >
                                        <ThunderboltFilled /> +{badge.xpReward} XP
                                    </Tag>
                                </div>
                            </div>

                            {/* Badge Title & Description */}
                            <div style={{ marginBottom: '14px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                                        {badge.title}
                                    </h3>
                                    {badge.unlocked ? (
                                        <CheckCircleFilled style={{ color: '#16a34a', fontSize: '16px' }} />
                                    ) : (
                                        <LockFilled style={{ color: '#94a3b8', fontSize: '14px' }} />
                                    )}
                                </div>
                                <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#475569', lineHeight: 1.45, minHeight: '38px' }}>
                                    {badge.description}
                                </p>
                            </div>

                            {/* Progress or Unlock Date */}
                            {badge.unlocked ? (
                                <div
                                    style={{
                                        fontSize: '12px',
                                        color: '#16a34a',
                                        fontWeight: 600,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '6px 10px',
                                        background: 'rgba(22, 163, 74, 0.08)',
                                        borderRadius: '8px',
                                    }}
                                >
                                    <span>🎉 Đã mở khóa thành công</span>
                                </div>
                            ) : (
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                                        <span>Tiến độ</span>
                                        <span>
                                            <strong>{badge.currentProgress}</strong> / {badge.targetProgress} {badge.progressUnit}
                                        </span>
                                    </div>
                                    <Progress
                                        percent={progressPercent}
                                        size="small"
                                        strokeColor={{
                                            '0%': '#3b82f6',
                                            '100%': '#10b981',
                                        }}
                                    />
                                </div>
                            )}
                        </Card>
                    );
                })}
            </div>
        </div>
    );
};

