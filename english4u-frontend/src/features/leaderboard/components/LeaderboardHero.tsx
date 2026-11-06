import React from 'react';
import { Card, Progress, Tag } from 'antd';
import {
    TrophyFilled,
    FireFilled,
    ThunderboltFilled,
    CrownFilled,
} from '@ant-design/icons';
import type { UserGamificationHeader } from '../types/leaderboard.types';

interface LeaderboardHeroProps {
    summary: UserGamificationHeader;
    userName?: string;
}

export const LeaderboardHero: React.FC<LeaderboardHeroProps> = ({ summary, userName = 'Bạn' }) => {
    const xpCurrentInLevel = summary.totalXp % 150;
    const xpPercent = Math.min(100, Math.round((xpCurrentInLevel / 150) * 100));

    return (
        <Card
            bordered={false}
            style={{
                background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 45%, #4338ca 100%)',
                borderRadius: '20px',
                color: '#fff',
                marginBottom: '24px',
                boxShadow: '0 20px 40px rgba(49, 46, 129, 0.25)',
                position: 'relative',
                overflow: 'hidden',
            }}
            bodyStyle={{ padding: '28px' }}
        >
            {/* Background decorative circles */}
            <div
                style={{
                    position: 'absolute',
                    top: '-60px',
                    right: '-40px',
                    width: '240px',
                    height: '240px',
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(234, 179, 8, 0.25) 0%, transparent 70%)',
                    pointerEvents: 'none',
                }}
            />
            <div
                style={{
                    position: 'absolute',
                    bottom: '-80px',
                    left: '20%',
                    width: '260px',
                    height: '260px',
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(99, 102, 241, 0.3) 0%, transparent 70%)',
                    pointerEvents: 'none',
                }}
            />

            <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                            <Tag
                                color="gold"
                                style={{
                                    fontSize: '13px',
                                    fontWeight: 700,
                                    padding: '4px 12px',
                                    borderRadius: '12px',
                                    border: 'none',
                                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                                    color: '#fff',
                                    boxShadow: '0 4px 12px rgba(245, 158, 11, 0.35)',
                                }}
                            >
                                <CrownFilled style={{ marginRight: '6px' }} />
                                Level {summary.level} • Cử Nhân IELTS
                            </Tag>
                            <span style={{ fontSize: '13px', color: '#c7d2fe' }}>
                                Xếp hạng cá nhân: <strong style={{ color: '#fef08a' }}>#{summary.currentRank}</strong>
                            </span>
                        </div>
                        <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 800, color: '#fff', letterSpacing: '-0.5px' }}>
                            Chào mừng {userName} đến Đấu Trường IELTS 🏆
                        </h1>
                        <p style={{ margin: '6px 0 0', color: '#e0e7ff', fontSize: '14px', maxWidth: '600px' }}>
                            Thi đua cùng hàng nghìn học viên mỗi tuần. Tích lũy chuỗi Streak, nâng tầm Band điểm và mở khóa danh hiệu vinh danh độc quyền!
                        </p>
                    </div>

                    {/* Stats pills */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        {/* Streak Pill */}
                        <div
                            style={{
                                background: 'rgba(255, 255, 255, 0.1)',
                                backdropFilter: 'blur(10px)',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                borderRadius: '16px',
                                padding: '12px 18px',
                                textAlign: 'center',
                                minWidth: '105px',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                <FireFilled style={{ fontSize: '20px', color: '#f97316' }} />
                                <span style={{ fontSize: '22px', fontWeight: 800, color: '#fff' }}>
                                    {summary.dailyStreak}
                                </span>
                            </div>
                            <div style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 600, marginTop: '2px' }}>
                                Chuỗi ngày học
                            </div>
                        </div>

                        {/* XP Pill */}
                        <div
                            style={{
                                background: 'rgba(255, 255, 255, 0.1)',
                                backdropFilter: 'blur(10px)',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                borderRadius: '16px',
                                padding: '12px 18px',
                                textAlign: 'center',
                                minWidth: '105px',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                <ThunderboltFilled style={{ fontSize: '20px', color: '#fbbf24' }} />
                                <span style={{ fontSize: '22px', fontWeight: 800, color: '#fff' }}>
                                    {summary.totalXp}
                                </span>
                            </div>
                            <div style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 600, marginTop: '2px' }}>
                                Tổng điểm XP
                            </div>
                        </div>

                        {/* Badges Pill */}
                        <div
                            style={{
                                background: 'rgba(255, 255, 255, 0.1)',
                                backdropFilter: 'blur(10px)',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                borderRadius: '16px',
                                padding: '12px 18px',
                                textAlign: 'center',
                                minWidth: '105px',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                <TrophyFilled style={{ fontSize: '20px', color: '#38bdf8' }} />
                                <span style={{ fontSize: '22px', fontWeight: 800, color: '#fff' }}>
                                    {summary.badgesUnlockedCount}/{summary.totalBadgesCount}
                                </span>
                            </div>
                            <div style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 600, marginTop: '2px' }}>
                                Huy hiệu mở
                            </div>
                        </div>
                    </div>
                </div>

                {/* Level Progress Bar */}
                <div
                    style={{
                        marginTop: '20px',
                        padding: '12px 16px',
                        background: 'rgba(15, 23, 42, 0.35)',
                        borderRadius: '12px',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#e0e7ff', marginBottom: '6px' }}>
                        <span>Tiến độ cấp độ: <strong>Level {summary.level}</strong></span>
                        <span>
                            {xpCurrentInLevel} / 150 XP để thăng hạng <strong>Level {summary.level + 1}</strong>
                        </span>
                    </div>
                    <Progress
                        percent={xpPercent}
                        showInfo={false}
                        strokeColor={{
                            '0%': '#38bdf8',
                            '100%': '#facc15',
                        }}
                        trailColor="rgba(255, 255, 255, 0.15)"
                        strokeWidth={8}
                    />
                </div>
            </div>
        </Card>
    );
};

