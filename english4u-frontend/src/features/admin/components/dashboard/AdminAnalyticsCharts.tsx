import React from 'react';
import { motion } from 'framer-motion';
import { Skeleton } from 'antd';
import {
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Tooltip,
    Legend,
} from 'recharts';
import { CHART_COLORS, item } from '../../constants/admin.constants';

function SectionHeader({ title }: { title: string }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ margin: 0, fontSize: '1.0625rem', fontWeight: 700, color: '#0f172a' }}>{title}</h3>
        </div>
    );
}

export interface AdminAnalyticsChartsProps {
    isAttemptsLoading: boolean;
    attemptsBySkill: Array<{ name: string; value: number }>;
}

export const AdminAnalyticsCharts: React.FC<AdminAnalyticsChartsProps> = ({
    isAttemptsLoading,
    attemptsBySkill,
}) => {
    return (
        <motion.div variants={item} style={{
            minWidth: 0,
            background: '#fff',
            borderRadius: 20,
            padding: '24px 20px',
            border: '1px solid #f1f5f9',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)',
        }}>
            <SectionHeader title="Lượt thi theo kỹ năng" />
            {isAttemptsLoading ? (
                <Skeleton active paragraph={{ rows: 5 }} />
            ) : attemptsBySkill.length === 0 ? (
                <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>
                    Chưa có dữ liệu
                </div>
            ) : (
                <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                        <Pie
                            data={attemptsBySkill}
                            cx="50%"
                            cy="50%"
                            innerRadius={65}
                            outerRadius={95}
                            paddingAngle={3}
                            dataKey="value"
                        >
                            {attemptsBySkill.map((_, idx) => (
                                <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip formatter={(v) => [`${v} lượt`, '']} />
                        <Legend
                            iconType="circle"
                            iconSize={8}
                            formatter={(v) => <span style={{ fontSize: '0.8rem', color: '#475569' }}>{v}</span>}
                        />
                    </PieChart>
                </ResponsiveContainer>
            )}
        </motion.div>
    );
};

