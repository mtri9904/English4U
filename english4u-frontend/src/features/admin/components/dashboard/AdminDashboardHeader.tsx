import React from 'react';
import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';
import { item } from '../../constants/admin.constants';

export interface AdminDashboardHeaderProps {
    onCreateExam: () => void;
}

export const AdminDashboardHeader: React.FC<AdminDashboardHeaderProps> = ({ onCreateExam }) => {
    return (
        <motion.div variants={item} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
            <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <div style={{
                        width: 8, height: 8, borderRadius: '50%', background: '#10b981',
                        boxShadow: '0 0 0 3px #d1fae5',
                        animation: 'pulse 2s ease-in-out infinite',
                    }} />
                    <span style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 600 }}>Hệ thống hoạt động bình thường</span>
                </div>
                <h2 style={{ margin: 0, fontSize: '1.875rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
                    Tổng quan hệ thống
                </h2>
                <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.9375rem' }}>
                    English4U Admin — Dữ liệu cập nhật theo thời gian thực
                </p>
            </div>
            <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                onClick={onCreateExam}
                style={{
                    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                    color: '#fff', border: 'none', borderRadius: 12,
                    padding: '10px 20px', fontWeight: 700, fontSize: '0.875rem',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                    boxShadow: '0 4px 16px rgba(99,102,241,0.35)',
                }}
            >
                <Zap size={15} />
                Tạo đề thi mới
            </motion.button>
        </motion.div>
    );
};

