import React from 'react';
import { motion } from 'framer-motion';
import { Avatar } from 'antd';
import { Users, CalendarClock, Eye, Pencil, Trash2 } from 'lucide-react';
import type { NotificationListItemDto } from '../types/notification.types';
import { avatarChar, roleStyle } from '../utils/notification.utils';
import { formatDateTimeToMinute } from '@/shared/lib/dateTime';

function ActionBtn({
    icon: Icon,
    label,
    color,
    bg,
    onClick,
    loading,
}: {
    icon: React.ElementType;
    label: string;
    color: string;
    bg: string;
    onClick: () => void;
    loading?: boolean;
}) {
    return (
        <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.94 }}
            onClick={onClick}
            disabled={loading}
            title={label}
            style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                background: loading ? '#f1f5f9' : bg,
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
            }}
        >
            <Icon size={15} color={loading ? '#94a3b8' : color} strokeWidth={2} />
        </motion.button>
    );
}

interface NotificationListItemCardProps {
    item: NotificationListItemDto;
    idx: number;
    isDeleting: boolean;
    onView: () => void;
    onEdit: () => void;
    onDelete: () => void;
}

export const NotificationListItemCard: React.FC<NotificationListItemCardProps> = ({
    item,
    idx,
    isDeleting,
    onView,
    onEdit,
    onDelete,
}) => {
    const rs = roleStyle(item.userRole);

    return (
        <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ delay: idx * 0.03, type: 'spring', stiffness: 280, damping: 22 }}
            style={{
                background: '#fff',
                borderRadius: 16,
                border: '1px solid #f1f5f9',
                borderLeft: `4px solid ${item.isRead ? '#e2e8f0' : '#6366f1'}`,
                padding: '16px 20px',
                boxShadow: item.isRead ? 'none' : '0 2px 12px rgba(99,102,241,0.06)',
                opacity: isDeleting ? 0.5 : 1,
                transition: 'opacity 0.2s',
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 260 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <Avatar
                            size={36}
                            style={{
                                background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                                fontWeight: 800,
                                fontSize: '0.875rem',
                                flexShrink: 0,
                            }}
                        >
                            {avatarChar(item.userDisplayName)}
                        </Avatar>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.9375rem' }}>{item.title}</span>
                                {!item.isRead && (
                                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#6366f1', flexShrink: 0 }} />
                                )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                                    <Users size={11} style={{ marginRight: 3, verticalAlign: 'middle' }} />
                                    {item.userDisplayName}
                                </span>
                                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{item.userEmail}</span>
                            </div>
                        </div>
                    </div>

                    {item.message && (
                        <p
                            style={{
                                margin: '10px 0 0 46px',
                                fontSize: '0.85rem',
                                color: '#475569',
                                lineHeight: 1.55,
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                            }}
                        >
                            {item.message}
                        </p>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, marginLeft: 46, flexWrap: 'wrap' }}>
                        <span
                            style={{
                                padding: '2px 9px',
                                borderRadius: 99,
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                background: rs.bg,
                                color: rs.color,
                            }}
                        >
                            {rs.label}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <CalendarClock size={11} />
                            {formatDateTimeToMinute(item.createdAt) || 'N/A'}
                        </span>
                        <span
                            style={{
                                padding: '2px 8px',
                                borderRadius: 99,
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                background: item.isRead ? '#f0fdf4' : '#eff6ff',
                                color: item.isRead ? '#15803d' : '#1d4ed8',
                            }}
                        >
                            {item.isRead ? '✓ Đã đọc' : '● Chưa đọc'}
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
                    <ActionBtn icon={Eye} label="Xem" color="#6366f1" bg="#ede9fe" onClick={onView} />
                    <ActionBtn icon={Pencil} label="Sửa" color="#0ea5e9" bg="#e0f2fe" onClick={onEdit} />
                    <ActionBtn
                        icon={Trash2}
                        label="Xóa"
                        color="#ef4444"
                        bg="#fee2e2"
                        loading={isDeleting}
                        onClick={onDelete}
                    />
                </div>
            </div>
        </motion.div>
    );
};

