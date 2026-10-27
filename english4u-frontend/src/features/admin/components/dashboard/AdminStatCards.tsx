import React from 'react';
import { motion } from 'framer-motion';
import { Skeleton } from 'antd';
import {
    Activity,
    Award,
    BarChart2,
    BookOpen,
    TrendingDown,
    TrendingUp,
    UserCheck,
    Users,
} from 'lucide-react';
import { item } from '../../constants/admin.constants';
import type { AdminUserStatsDto } from '@/features/students';

interface StatCardProps {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: React.ElementType;
    gradient: string;
    trend?: { value: string; up: boolean };
    loading?: boolean;
}

function StatCard({ title, value, subtitle, icon: Icon, gradient, trend, loading }: StatCardProps) {
    return (
        <motion.div variants={item} whileHover={{ y: -4 }} transition={{ type: 'spring', stiffness: 400 }}>
            <div style={{
                background: '#fff',
                borderRadius: 20,
                padding: '24px',
                border: '1px solid #f1f5f9',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)',
                position: 'relative',
                overflow: 'hidden',
                cursor: 'default',
            }}>
                <div style={{
                    position: 'absolute', top: -30, right: -30,
                    width: 120, height: 120, borderRadius: '50%',
                    background: gradient, opacity: 0.08,
                }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: '0.8125rem', color: '#94a3b8', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                            {title}
                        </p>
                        {loading ? (
                            <Skeleton.Input active size="large" style={{ marginTop: 8, width: 100, height: 36 }} />
                        ) : (
                            <p style={{ margin: '8px 0 0', fontSize: '2.25rem', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>
                                {value}
                            </p>
                        )}
                        {subtitle && !loading && (
                            <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: '#64748b' }}>{subtitle}</p>
                        )}
                    </div>
                    <div style={{
                        width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                        background: gradient,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: `0 8px 24px ${gradient.slice(gradient.indexOf('#'), gradient.indexOf('#') + 7)}33`,
                    }}>
                        <Icon size={24} color="#fff" strokeWidth={2} />
                    </div>
                </div>
                {trend && !loading && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 14 }}>
                        {trend.up
                            ? <TrendingUp size={13} color="#10b981" />
                            : <TrendingDown size={13} color="#ef4444" />}
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: trend.up ? '#10b981' : '#ef4444' }}>
                            {trend.value}
                        </span>
                    </div>
                )}
            </div>
        </motion.div>
    );
}

export interface AdminStatCardsProps {
    userStats?: AdminUserStatsDto;
    isUserStatsLoading: boolean;
    publishedExamsCount: number;
    draftExamsCount: number;
    isExamsLoading: boolean;
    attemptsCount: number;
    completedAttempts: number;
    inProgressAttempts: number;
    isAttemptsLoading: boolean;
    avgBand: string | null;
}

export const AdminStatCards: React.FC<AdminStatCardsProps> = ({
    userStats,
    isUserStatsLoading,
    publishedExamsCount,
    draftExamsCount,
    isExamsLoading,
    attemptsCount,
    completedAttempts,
    inProgressAttempts,
    isAttemptsLoading,
    avgBand,
}) => {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18 }}>
            <StatCard
                title="Tổng học viên"
                value={isUserStatsLoading ? '...' : (userStats?.totalUsers ?? 0).toLocaleString()}
                subtitle={`${userStats?.premiumUsers ?? 0} học viên Premium`}
                icon={Users}
                gradient="linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)"
                loading={isUserStatsLoading}
            />
            <StatCard
                title="Đang trực tuyến"
                value={isUserStatsLoading ? '...' : (userStats?.onlineUsers ?? 0)}
                subtitle={`${userStats?.activeUsers ?? 0} tài khoản kích hoạt`}
                icon={UserCheck}
                gradient="linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)"
                loading={isUserStatsLoading}
            />
            <StatCard
                title="Đề thi đang mở"
                value={isExamsLoading ? '...' : publishedExamsCount}
                subtitle={`${draftExamsCount} bản nháp`}
                icon={BookOpen}
                gradient="linear-gradient(135deg, #10b981 0%, #059669 100%)"
                loading={isExamsLoading}
            />
            <StatCard
                title="Tổng lượt thi"
                value={isAttemptsLoading ? '...' : attemptsCount.toLocaleString()}
                subtitle={`${completedAttempts} hoàn thành · ${inProgressAttempts} đang thi`}
                icon={Activity}
                gradient="linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)"
                loading={isAttemptsLoading}
            />
            {avgBand !== null && (
                <StatCard
                    title="Band TB (có điểm)"
                    value={avgBand ?? '—'}
                    subtitle="Trung bình band score"
                    icon={Award}
                    gradient="linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)"
                    loading={isAttemptsLoading}
                />
            )}
            <StatCard
                title="Điểm TB học viên"
                value={isUserStatsLoading ? '...' : (userStats?.globalAverageScore?.toFixed(1) ?? '—')}
                subtitle="Điểm trung bình toàn hệ thống"
                icon={BarChart2}
                gradient="linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)"
                loading={isUserStatsLoading}
            />
        </div>
    );
};

