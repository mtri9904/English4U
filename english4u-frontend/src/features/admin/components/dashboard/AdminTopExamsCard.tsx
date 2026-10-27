import React from 'react';
import { motion } from 'framer-motion';
import { Skeleton } from 'antd';
import { ArrowRight } from 'lucide-react';
import { CHART_COLORS, item } from '../../constants/admin.constants';

export interface TopExamItem {
    title: string;
    type: string;
    count: number;
}

export interface AdminTopExamsCardProps {
    isLoading: boolean;
    topExams: TopExamItem[];
    onViewAll: () => void;
}

export const AdminTopExamsCard: React.FC<AdminTopExamsCardProps> = ({
    isLoading,
    topExams,
    onViewAll,
}) => {
    return (
        <motion.div variants={item} style={{
            background: '#fff', borderRadius: 20, padding: '24px',
            border: '1px solid #f1f5f9',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)',
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ margin: 0, fontSize: '1.0625rem', fontWeight: 700, color: '#0f172a' }}>Top đề thi được luyện nhiều nhất</h3>
                <button
                    onClick={onViewAll}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                    Xem tất cả <ArrowRight size={13} />
                </button>
            </div>

            {isLoading ? (
                <Skeleton active paragraph={{ rows: 4 }} />
            ) : topExams.length === 0 ? (
                <p style={{ color: '#94a3b8', textAlign: 'center', margin: '24px 0' }}>Chưa có dữ liệu lượt thi</p>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {topExams.map((exam, idx) => {
                        const maxCount = topExams[0].count;
                        const pct = maxCount > 0 ? (exam.count / maxCount) * 100 : 0;
                        return (
                            <div key={idx}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                                        <span style={{
                                            width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                                            background: CHART_COLORS[idx % CHART_COLORS.length] + '20',
                                            color: CHART_COLORS[idx % CHART_COLORS.length],
                                            fontWeight: 800, fontSize: '0.75rem',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}>{idx + 1}</span>
                                        <span style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exam.title}</span>
                                        <span style={{
                                            padding: '2px 8px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 600, flexShrink: 0,
                                            background: '#ede9fe',
                                            color: '#7c3aed',
                                        }}>{exam.type}</span>
                                    </div>
                                    <span style={{ fontWeight: 700, color: '#475569', fontSize: '0.875rem', flexShrink: 0, marginLeft: 8 }}>{exam.count} lượt</span>
                                </div>
                                <div style={{ height: 5, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${pct}%` }}
                                        transition={{ duration: 0.8, delay: idx * 0.1, ease: 'easeOut' }}
                                        style={{ height: '100%', background: CHART_COLORS[idx % CHART_COLORS.length], borderRadius: 99 }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </motion.div>
    );
};

