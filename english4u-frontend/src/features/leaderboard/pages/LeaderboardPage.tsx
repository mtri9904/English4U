import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, Segmented, Spin, Empty } from 'antd';
import { PageErrorState } from '@/components';
import {
    TrophyFilled,
    FireFilled,
    AimOutlined,
    ClockCircleOutlined,
    CalendarOutlined,
    GlobalOutlined,
} from '@ant-design/icons';
import { useUserProfileQuery } from '@/features/students';
import { useLeaderboardOverviewQuery } from '../hooks/useLeaderboardQueries';
import type { LeaderboardCategory, LeaderboardPeriod } from '../types/leaderboard.types';
import { LeaderboardHero } from '../components/LeaderboardHero';
import { LeaderboardPodium } from '../components/LeaderboardPodium';
import { LeaderboardTable } from '../components/LeaderboardTable';
import { BadgeShowcase } from '../components/BadgeShowcase';
import { WeeklyQuestsSection } from '../components/WeeklyQuestsSection';

export const LeaderboardPage: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();

    // 1. Read category, period, tab from URL search parameters with fallback defaults
    const categoryParam = searchParams.get('category');
    const category: LeaderboardCategory =
        categoryParam === 'streak' || categoryParam === 'score' ? categoryParam : 'diligence';

    const periodParam = searchParams.get('period');
    const period: LeaderboardPeriod =
        periodParam === 'month' || periodParam === 'all' ? periodParam : 'week';

    const tabParam = searchParams.get('tab');
    const mainTab =
        tabParam === 'badges' || tabParam === 'quests' ? tabParam : 'rankings';

    // 2. Handlers to push filter changes to URL
    const handleCategoryChange = (val: LeaderboardCategory) => {
        setSearchParams(
            (prev) => {
                const next = new URLSearchParams(prev);
                next.set('category', val);
                return next;
            },
            { replace: true }
        );
    };

    const handlePeriodChange = (val: LeaderboardPeriod) => {
        setSearchParams(
            (prev) => {
                const next = new URLSearchParams(prev);
                next.set('period', val);
                return next;
            },
            { replace: true }
        );
    };

    const handleTabChange = (val: string) => {
        setSearchParams(
            (prev) => {
                const next = new URLSearchParams(prev);
                next.set('tab', val);
                return next;
            },
            { replace: true }
        );
    };

    const { data: userProfile } = useUserProfileQuery();
    const { data: overview, isLoading, isError, refetch } = useLeaderboardOverviewQuery(category, period);

    const rankings = overview?.rankings ?? [];
    const topThree = rankings.slice(0, 3);
    const currentUserRank = overview?.currentUserRank;

    const categoryOptions = [
        {
            value: 'diligence',
            label: (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px' }}>
                    <ClockCircleOutlined style={{ color: '#2563eb' }} />
                    <span style={{ fontWeight: 600 }}>Top Chăm Chỉ</span>
                </div>
            ),
        },
        {
            value: 'streak',
            label: (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px' }}>
                    <FireFilled style={{ color: '#f97316' }} />
                    <span style={{ fontWeight: 600 }}>Top Chuỗi Ngày (Streak)</span>
                </div>
            ),
        },
        {
            value: 'score',
            label: (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px' }}>
                    <AimOutlined style={{ color: '#16a34a' }} />
                    <span style={{ fontWeight: 600 }}>Top Điểm Cao (Band Score)</span>
                </div>
            ),
        },
    ];

    const periodOptions = [
        {
            value: 'week',
            label: (
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <CalendarOutlined />
                    <span>Tuần này</span>
                </div>
            ),
        },
        {
            value: 'month',
            label: (
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <CalendarOutlined />
                    <span>Tháng này</span>
                </div>
            ),
        },
        {
            value: 'all',
            label: (
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <GlobalOutlined />
                    <span>Toàn thời gian</span>
                </div>
            ),
        },
    ];

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px 48px' }}>
            {/* Top Gamification Hero */}
            {overview?.userSummary && (
                <LeaderboardHero
                    summary={overview.userSummary}
                    userName={userProfile?.displayName || 'Bạn'}
                />
            )}

            {/* Main Tabs Navigation */}
            <Tabs
                activeKey={mainTab}
                onChange={handleTabChange}
                size="large"
                tabBarStyle={{ marginBottom: '24px', fontWeight: 700 }}
                items={[
                    {
                        key: 'rankings',
                        label: (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px' }}>
                                <TrophyFilled style={{ color: '#f59e0b' }} />
                                Bảng Xếp Hạng
                            </span>
                        ),
                        children: (
                            <div>
                                {/* Filters Row: Category Sub-tabs & Period Filter */}
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        flexWrap: 'wrap',
                                        gap: '14px',
                                        background: '#fff',
                                        padding: '16px 20px',
                                        borderRadius: '16px',
                                        boxShadow: '0 4px 14px rgba(15, 23, 42, 0.04)',
                                        marginBottom: '24px',
                                    }}
                                >
                                    <Segmented
                                        options={categoryOptions}
                                        value={category}
                                        onChange={(val) => handleCategoryChange(val as LeaderboardCategory)}
                                        size="large"
                                        style={{ background: '#f1f5f9', padding: '4px', borderRadius: '12px' }}
                                    />

                                    <Segmented
                                        options={periodOptions}
                                        value={period}
                                        onChange={(val) => handlePeriodChange(val as LeaderboardPeriod)}
                                        size="large"
                                        style={{ background: '#f1f5f9', padding: '4px', borderRadius: '12px' }}
                                    />
                                </div>

                                {isLoading ? (
                                    <div style={{ textAlign: 'center', padding: '60px 0' }}>
                                        <Spin size="large" tip="Đang tải dữ liệu Bảng xếp hạng..." />
                                    </div>
                                ) : isError ? (
                                    <div style={{ padding: '24px 0' }}>
                                        <PageErrorState
                                            title="Úi, có lỗi rồi!"
                                            subTitle="Bảng xếp hạng chưa tải được. Đừng lo, kết quả học tập của bạn vẫn an toàn!"
                                            onRetry={() => refetch()}
                                        />
                                    </div>
                                ) : rankings.length === 0 ? (
                                    <Empty description="Chưa có dữ liệu xếp hạng trong thời gian này." />
                                ) : (
                                    <>
                                        {/* Top 3 Podium */}
                                        <LeaderboardPodium topThree={topThree} />

                                        {/* Rank 4+ Detailed Table */}
                                        <LeaderboardTable
                                            items={rankings}
                                            currentUserRank={currentUserRank}
                                        />
                                    </>
                                )}
                            </div>
                        ),
                    },
                    {
                        key: 'badges',
                        label: (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px' }}>
                                <span>🎖️</span>
                                Huy Hiệu Đạt Được ({overview?.badges?.filter((b) => b.unlocked)?.length ?? 0}/{overview?.badges?.length ?? 0})
                            </span>
                        ),
                        children: (
                            <BadgeShowcase badges={overview?.badges ?? []} />
                        ),
                    },
                    {
                        key: 'quests',
                        label: (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px' }}>
                                <span>🎯</span>
                                Thử Thách Tuần ({overview?.weeklyQuests?.filter((q) => q.isCompleted)?.length ?? 0}/{overview?.weeklyQuests?.length ?? 0})
                            </span>
                        ),
                        children: (
                            <WeeklyQuestsSection quests={overview?.weeklyQuests ?? []} />
                        ),
                    },
                ]}
            />
        </div>
    );
};
