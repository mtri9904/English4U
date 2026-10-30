import React from 'react';
import { motion } from 'framer-motion';
import { Skeleton } from 'antd';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Legend,
} from 'recharts';
import { CHART_COLORS, item } from '../../constants/admin.constants';

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; color: string }[]; label?: string }) {
    if (!active || !payload?.length) return null;
    return (
        <div style={{
            background: '#0f172a',
            borderRadius: 10,
            padding: '10px 16px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        }}>
            {label && <p style={{ margin: '0 0 6px', color: '#94a3b8', fontSize: '0.75rem' }}>{label}</p>}
            {payload.map((p, i) => (
                <p key={i} style={{ margin: 0, fontWeight: 700, color: p.color, fontSize: '0.9rem' }}>
                    {p.value} <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: '0.8rem' }}>{p.name}</span>
                </p>
            ))}
        </div>
    );
}

function SectionHeader({ title }: { title: string }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ margin: 0, fontSize: '1.0625rem', fontWeight: 700, color: '#0f172a' }}>{title}</h3>
        </div>
    );
}

export interface AdminAnalyticsChartsProps {
    isExamsLoading: boolean;
    examByType: Array<{ name: string; count: number }>;
    isAttemptsLoading: boolean;
    attemptsBySkill: Array<{ name: string; value: number }>;
}

export const AdminAnalyticsCharts: React.FC<AdminAnalyticsChartsProps> = ({
    isExamsLoading,
    examByType,
    isAttemptsLoading,
    attemptsBySkill,
}) => {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 20 }}>
            <motion.div variants={item} style={{
                minWidth: 0,
                background: '#fff', borderRadius: 20, padding: '24px 20px',
                border: '1px solid #f1f5f9',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)',
            }}>
                <SectionHeader title="Đề thi theo loại" />
                {isExamsLoading ? (
                    <Skeleton active paragraph={{ rows: 5 }} />
                ) : examByType.length === 0 ? (
                    <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>
                        Chưa có dữ liệu
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={examByType} barSize={36}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                            <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
                            <Bar dataKey="count" name="đề thi" radius={[8, 8, 0, 0]}>
                                {examByType.map((_, idx) => (
                                    <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </motion.div>

            <motion.div variants={item} style={{
                minWidth: 0,
                background: '#fff', borderRadius: 20, padding: '24px 20px',
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
                    <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                            <Pie
                                data={attemptsBySkill}
                                cx="50%" cy="50%"
                                innerRadius={55} outerRadius={85}
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
        </div>
    );
};

