import React from 'react';
import { motion } from 'framer-motion';
import {
    Activity,
    ArrowRight,
    BookOpen,
    CheckCircle2,
    Clock,
    Users,
    WifiOff,
} from 'lucide-react';
import { item } from '../../constants/admin.constants';

interface QuickActionProps {
    label: string;
    desc: string;
    icon: React.ElementType;
    color: string;
    onClick: () => void;
}

function QuickAction({ label, desc, icon: Icon, color, onClick }: QuickActionProps) {
    return (
        <motion.button
            variants={item}
            whileHover={{ scale: 1.02, boxShadow: '0 8px 32px rgba(0,0,0,0.10)' }}
            whileTap={{ scale: 0.98 }}
            onClick={onClick}
            style={{
                background: '#fff', border: '1px solid #f1f5f9', borderRadius: 16,
                padding: '18px 20px', cursor: 'pointer', textAlign: 'left', width: '100%',
                display: 'flex', alignItems: 'center', gap: 14,
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
        >
            <div style={{
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <Icon size={20} color={color} strokeWidth={2} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 700, color: '#0f172a', fontSize: '0.9rem' }}>{label}</p>
                <p style={{ margin: '2px 0 0', color: '#94a3b8', fontSize: '0.78rem' }}>{desc}</p>
            </div>
            <ArrowRight size={16} color="#cbd5e1" />
        </motion.button>
    );
}

export interface AdminQuickActionsCardProps {
    completedAttempts: number;
    inProgressAttempts: number;
    abandonedAttempts: number;
    draftExamsCount: number;
    onNavigate: (path: string) => void;
}

export const AdminQuickActionsCard: React.FC<AdminQuickActionsCardProps> = ({
    completedAttempts,
    inProgressAttempts,
    abandonedAttempts,
    draftExamsCount,
    onNavigate,
}) => {
    return (
        <motion.div variants={item} style={{
            minWidth: 0,
            background: '#fff', borderRadius: 20, padding: '24px',
            border: '1px solid #f1f5f9',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)',
            display: 'flex', flexDirection: 'column', gap: 10,
        }}>
            <h3 style={{ margin: '0 0 6px', fontSize: '1.0625rem', fontWeight: 700, color: '#0f172a' }}>Thao tác nhanh</h3>
            <QuickAction
                icon={Users}
                label="Quản lý học viên"
                desc="Xem, khoá, phân quyền tài khoản"
                color="#6366f1"
                onClick={() => onNavigate('/admin/users')}
            />
            <QuickAction
                icon={BookOpen}
                label="Quản lý đề thi"
                desc="Tạo mới, chỉnh sửa, xuất bản"
                color="#06b6d4"
                onClick={() => onNavigate('/admin/exams')}
            />
            <QuickAction
                icon={Activity}
                label="Lượt thi"
                desc="Giám sát, kiểm tra kết quả"
                color="#10b981"
                onClick={() => onNavigate('/admin/attempts')}
            />

            <div style={{ marginTop: 8, background: '#f8fafc', borderRadius: 14, padding: '16px' }}>
                <p style={{ margin: '0 0 10px', fontWeight: 700, fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Tình trạng nhanh
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <CheckCircle2 size={14} color="#10b981" />
                            <span style={{ fontSize: '0.82rem', color: '#475569' }}>Lượt hoàn thành</span>
                        </div>
                        <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.875rem' }}>{completedAttempts}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Clock size={14} color="#3b82f6" />
                            <span style={{ fontSize: '0.82rem', color: '#475569' }}>Đang thi</span>
                        </div>
                        <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.875rem' }}>{inProgressAttempts}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <WifiOff size={14} color="#94a3b8" />
                            <span style={{ fontSize: '0.82rem', color: '#475569' }}>Đã bỏ dở</span>
                        </div>
                        <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.875rem' }}>
                            {abandonedAttempts}
                        </span>
                    </div>
                    <div style={{ height: 1, background: '#e2e8f0', margin: '2px 0' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <BookOpen size={14} color="#8b5cf6" />
                            <span style={{ fontSize: '0.82rem', color: '#475569' }}>Đề bản nháp</span>
                        </div>
                        <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.875rem' }}>{draftExamsCount}</span>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

