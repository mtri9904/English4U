import React from 'react';
import { motion } from 'framer-motion';
import { Skeleton } from 'antd';
import { Bell, MailOpen, CalendarClock, CheckCheck } from 'lucide-react';

interface StatCardProps {
    icon: React.ElementType;
    label: string;
    value: number | string;
    gradient: string;
    loading?: boolean;
}

const cardAnim = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 280, damping: 22 } },
} as const;

export const StatCard: React.FC<StatCardProps> = ({
    icon: Icon,
    label,
    value,
    gradient,
    loading,
}) => {
    return (
        <div
            style={{
                flex: 1,
                minWidth: 150,
                background: '#fff',
                borderRadius: 18,
                padding: '18px 20px',
                border: '1px solid #f1f5f9',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
            }}
        >
            <div
                style={{
                    width: 46,
                    height: 46,
                    borderRadius: 13,
                    flexShrink: 0,
                    background: gradient,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <Icon size={20} color="#fff" strokeWidth={2} />
            </div>
            <div>
                <div
                    style={{
                        fontSize: '0.72rem',
                        color: '#94a3b8',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                    }}
                >
                    {label}
                </div>
                {loading ? (
                    <Skeleton.Input active size="small" style={{ width: 60, marginTop: 4 }} />
                ) : (
                    <div
                        style={{
                            fontSize: '1.5rem',
                            fontWeight: 800,
                            color: '#0f172a',
                            lineHeight: 1.2,
                            marginTop: 2,
                        }}
                    >
                        {value}
                    </div>
                )}
            </div>
        </div>
    );
};

interface NotificationStatsRowProps {
    stats?: { total?: number; unread?: number; createdToday?: number } | null;
    isStatsLoading: boolean;
}

export const NotificationStatsRow: React.FC<NotificationStatsRowProps> = ({
    stats,
    isStatsLoading,
}) => {
    return (
        <motion.div variants={cardAnim} style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <StatCard
                icon={Bell}
                label="Tổng thông báo"
                value={stats?.total ?? 0}
                gradient="linear-gradient(135deg,#6366f1,#8b5cf6)"
                loading={isStatsLoading}
            />
            <StatCard
                icon={MailOpen}
                label="Chưa đọc"
                value={stats?.unread ?? 0}
                gradient="linear-gradient(135deg,#ef4444,#f97316)"
                loading={isStatsLoading}
            />
            <StatCard
                icon={CalendarClock}
                label="Mới hôm nay"
                value={stats?.createdToday ?? 0}
                gradient="linear-gradient(135deg,#06b6d4,#0ea5e9)"
                loading={isStatsLoading}
            />
            <StatCard
                icon={CheckCheck}
                label="Đã đọc"
                value={Math.max(0, (stats?.total ?? 0) - (stats?.unread ?? 0))}
                gradient="linear-gradient(135deg,#10b981,#059669)"
                loading={isStatsLoading}
            />
        </motion.div>
    );
};

