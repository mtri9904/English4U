import React from 'react';
import { motion } from 'framer-motion';
import { Skeleton } from 'antd';
import { ArrowRight } from 'lucide-react';
import { item, skillLabel } from '../../constants/admin.constants';
import { formatStatus, getStatusColor } from '../../utils/admin.utils';
import type { AdminAttemptListItemDto } from '@/features/attempts';

export interface AdminRecentAttemptsCardProps {
    isLoading: boolean;
    recentAttempts: AdminAttemptListItemDto[];
    onViewAll: () => void;
}

export const AdminRecentAttemptsCard: React.FC<AdminRecentAttemptsCardProps> = ({
    isLoading,
    recentAttempts,
    onViewAll,
}) => {
    return (
        <motion.div variants={item} style={{
            minWidth: 0,
            background: '#fff', borderRadius: 20, padding: '24px',
            border: '1px solid #f1f5f9',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)',
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ margin: 0, fontSize: '1.0625rem', fontWeight: 700, color: '#0f172a' }}>Lượt thi gần đây</h3>
                <button
                    onClick={onViewAll}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                    Xem tất cả <ArrowRight size={13} />
                </button>
            </div>

            {isLoading ? (
                <Skeleton active paragraph={{ rows: 5 }} />
            ) : recentAttempts.length === 0 ? (
                <p style={{ color: '#94a3b8', textAlign: 'center', margin: '24px 0' }}>Chưa có lượt thi nào</p>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
                        <thead>
                            <tr>
                                {['Học viên', 'Đề thi', 'Kỹ năng', 'Trạng thái', 'Điểm'].map((h) => (
                                    <th key={h} style={{
                                        textAlign: 'left', padding: '8px 12px',
                                        fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8',
                                        borderBottom: '1px solid #f1f5f9', textTransform: 'uppercase', letterSpacing: '0.05em',
                                    }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {recentAttempts.map((a, i) => {
                                const sc = getStatusColor(a.status);
                                return (
                                    <motion.tr
                                        key={a.sessionId}
                                        initial={{ opacity: 0, x: -8 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.4 + i * 0.06 }}
                                        onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                                        style={{ borderRadius: 8, cursor: 'default' }}
                                    >
                                        <td style={{ padding: '11px 12px' }}>
                                            <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.85rem' }}>{a.userDisplayName}</div>
                                            <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{a.userEmail}</div>
                                        </td>
                                        <td style={{ padding: '11px 12px' }}>
                                            <div style={{ fontWeight: 500, color: '#334155', fontSize: '0.85rem', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {a.examTitle}
                                            </div>
                                        </td>
                                        <td style={{ padding: '11px 12px' }}>
                                            <span style={{ fontSize: '0.8rem', color: '#475569' }}>{skillLabel[a.skillType] ?? a.skillType}</span>
                                        </td>
                                        <td style={{ padding: '11px 12px' }}>
                                            <span style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                                padding: '3px 10px', borderRadius: 20,
                                                background: sc.bg, color: sc.text,
                                                fontSize: '0.75rem', fontWeight: 600,
                                            }}>
                                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: sc.dot, flexShrink: 0 }} />
                                                {formatStatus(a.status)}
                                            </span>
                                        </td>
                                        <td style={{ padding: '11px 12px' }}>
                                            {(() => {
                                                const score = a.totalAutoScore ?? a.readingScore ?? a.listeningScore;
                                                const hasScore = score != null;
                                                const displayScore = hasScore
                                                    ? (a.totalQuestions > 0 ? `${score}/${a.totalQuestions}` : `${score}`)
                                                    : (a.totalBandScore != null && a.totalBandScore > 0 ? `${a.totalBandScore}` : '—');
                                                return (
                                                    <span style={{ fontWeight: 700, color: hasScore || (a.totalBandScore != null && a.totalBandScore > 0) ? '#6366f1' : '#cbd5e1', fontSize: '0.875rem' }}>
                                                        {displayScore}
                                                    </span>
                                                );
                                            })()}
                                        </td>
                                    </motion.tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </motion.div>
    );
};

