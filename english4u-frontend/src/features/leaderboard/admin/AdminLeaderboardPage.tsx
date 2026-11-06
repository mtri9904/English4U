import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Segmented, Button, Tabs, Spin, Card } from 'antd';
import { PageErrorState } from '@/components';
import {
    TrophyFilled,
    FireFilled,
    AimOutlined,
    ClockCircleOutlined,
    ReloadOutlined,
    AppstoreOutlined,
    SafetyCertificateOutlined,
    FlagOutlined,
} from '@ant-design/icons';
import { useAdminLeaderboardOverviewQuery } from '../hooks/useLeaderboardQueries';
import type { LeaderboardCategory, LeaderboardPeriod } from '../types/leaderboard.types';
import { AdminLeaderboardKpis } from './AdminLeaderboardKpis';
import { AdminLeaderboardPodium } from './AdminLeaderboardPodium';
import { AdminLeaderboardTable } from './AdminLeaderboardTable';
import { AdminBadgeDistribution } from './AdminBadgeDistribution';
import { AdminQuestOverviewCard } from './AdminQuestOverviewCard';

export const AdminLeaderboardPage: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();

    // 1. Read category, period, tab from URL search parameters with fallback defaults
    const categoryParam = searchParams.get('category');
    const category: LeaderboardCategory =
        categoryParam === 'streak' || categoryParam === 'score' ? categoryParam : 'diligence';

    const periodParam = searchParams.get('period');
    const period: LeaderboardPeriod =
        periodParam === 'month' || periodParam === 'all' ? periodParam : 'week';

    const tabParam = searchParams.get('tab');
    const activeTab =
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

    const { data, isLoading, isError, refetch, isFetching } = useAdminLeaderboardOverviewQuery(
        category,
        period
    );

    const categoryOptions = [
        {
            value: 'diligence',
            label: (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 6px' }}>
                    <ClockCircleOutlined style={{ color: '#2563eb' }} />
                    <span>Top Chăm Chỉ (Giờ học)</span>
                </div>
            ),
        },
        {
            value: 'streak',
            label: (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 6px' }}>
                    <FireFilled style={{ color: '#ea580c' }} />
                    <span>Top Chuỗi Ngày (Streak)</span>
                </div>
            ),
        },
        {
            value: 'score',
            label: (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 6px' }}>
                    <AimOutlined style={{ color: '#059669' }} />
                    <span>Top Điểm Cao (Band Score)</span>
                </div>
            ),
        },
    ];

    const periodOptions = [
        { value: 'week', label: 'Tuần này' },
        { value: 'month', label: 'Tháng này' },
        { value: 'all', label: 'Toàn thời gian' },
    ];

    return (
        <div style={{ padding: '0 8px 32px' }}>
            {/* Header Title & Subtitle */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '16px',
                    marginBottom: '20px',
                }}
            >
                <div>
                    <h1
                        style={{
                            margin: 0,
                            fontSize: '24px',
                            fontWeight: 800,
                            color: '#0f172a',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                        }}
                    >
                        <TrophyFilled style={{ color: '#f59e0b' }} />
                        Tổng Quan Bảng Xếp Hạng & Thi Đua
                    </h1>
                    <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '14px' }}>
                        Theo dõi thứ hạng học viên, tỷ lệ chinh phục danh hiệu và mức độ tương tác thử thách tuần từ dữ liệu thực tế.
                    </p>
                </div>

                <Button
                    icon={<ReloadOutlined spin={isFetching} />}
                    onClick={() => refetch()}
                    style={{ borderRadius: '10px', fontWeight: 600 }}
                >
                    Làm mới
                </Button>
            </div>

            {/* Filter Bar with URL synchronization */}
            <Card
                bordered={false}
                style={{
                    borderRadius: '16px',
                    background: '#fff',
                    marginBottom: '24px',
                    boxShadow: '0 4px 14px rgba(15, 23, 42, 0.04)',
                }}
                styles={{ body: { padding: '16px 20px' } }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '14px',
                    }}
                >
                    <Segmented
                        options={categoryOptions}
                        value={category}
                        onChange={(val) => handleCategoryChange(val as LeaderboardCategory)}
                        size="large"
                        style={{ background: '#f1f5f9', padding: '3px', borderRadius: '12px' }}
                    />

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>
                            Kỳ báo cáo:
                        </span>
                        <Segmented
                            options={periodOptions}
                            value={period}
                            onChange={(val) => handlePeriodChange(val as LeaderboardPeriod)}
                            style={{ background: '#f1f5f9', padding: '3px', borderRadius: '10px' }}
                        />
                    </div>
                </div>
            </Card>

            {/* Content Loading / Error / Data */}
            {isLoading ? (
                <div style={{ textAlign: 'center', padding: '80px 0' }}>
                    <Spin size="large" />
                    <div style={{ marginTop: '16px', color: '#64748b', fontWeight: 500 }}>
                        Đang tổng hợp dữ liệu bảng xếp hạng từ hệ thống...
                    </div>
                </div>
            ) : isError ? (
                <div style={{ marginBottom: '24px' }}>
                    <PageErrorState
                        title="Không thể tải dữ liệu bảng xếp hạng"
                        subTitle="Đã có lỗi xảy ra khi truy vấn dữ liệu từ máy chủ. Vui lòng kiểm tra lại kết nối mạng hoặc thử lại sau."
                        status="warning"
                        onRetry={() => refetch()}
                    />
                </div>
            ) : data ? (
                <div>
                    {/* KPI Stat Cards */}
                    <AdminLeaderboardKpis data={data} />

                    {/* Main Tabs */}
                    <Tabs
                        activeKey={activeTab}
                        onChange={handleTabChange}
                        size="large"
                        tabBarStyle={{ marginBottom: '20px', fontWeight: 700 }}
                        items={[
                            {
                                key: 'rankings',
                                label: (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <AppstoreOutlined />
                                        Bảng Xếp Hạng & Bục Vinh Danh
                                    </span>
                                ),
                                children: (
                                    <div>
                                        {/* Podium stand */}
                                        <AdminLeaderboardPodium topThree={data.rankings.slice(0, 3)} />

                                        {/* Full Interactive Table */}
                                        <AdminLeaderboardTable items={data.rankings} />
                                    </div>
                                ),
                            },
                            {
                                key: 'badges',
                                label: (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <SafetyCertificateOutlined />
                                        Phân Bổ Danh Hiệu ({data.badgeDistribution.length})
                                    </span>
                                ),
                                children: (
                                    <AdminBadgeDistribution
                                        badges={data.badgeDistribution}
                                        totalLearners={data.totalLearners}
                                    />
                                ),
                            },
                            {
                                key: 'quests',
                                label: (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <FlagOutlined />
                                        Tiến Độ Thử Thách Tuần ({data.questOverview.length})
                                    </span>
                                ),
                                children: (
                                    <AdminQuestOverviewCard
                                        quests={data.questOverview}
                                        totalLearners={data.totalLearners}
                                    />
                                ),
                            },
                        ]}
                    />
                </div>
            ) : null}
        </div>
    );
};
