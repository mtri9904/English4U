import React from 'react';
import { Drawer, Avatar } from 'antd';
import { motion } from 'framer-motion';
import { Bell, Pencil } from 'lucide-react';
import type { NotificationListItemDto } from '../types/notification.types';
import { avatarChar, roleStyle } from '../utils/notification.utils';
import { formatDateTimeToMinute } from '@/shared/lib/dateTime';

interface NotificationDetailDrawerProps {
    selected: NotificationListItemDto | null;
    onClose: () => void;
    onEdit: (item: NotificationListItemDto) => void;
}

export const NotificationDetailDrawer: React.FC<NotificationDetailDrawerProps> = ({
    selected,
    onClose,
    onEdit,
}) => {
    return (
        <Drawer
            open={!!selected}
            onClose={onClose}
            width={520}
            styles={{
                header: { borderBottom: '1px solid #f1f5f9', padding: '20px 24px' },
                body: { padding: 0, background: '#f8fafc' },
            }}
            title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                        style={{
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <Bell size={15} color="#fff" />
                    </div>
                    <div>
                        <div style={{ fontWeight: 800, fontSize: '0.9375rem', color: '#0f172a' }}>Chi tiết thông báo</div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 400 }}>Xem đầy đủ nội dung</div>
                    </div>
                </div>
            }
            extra={
                selected && (
                    <motion.button
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => onEdit(selected)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '6px 14px',
                            borderRadius: 8,
                            background: '#eff6ff',
                            border: 'none',
                            fontWeight: 600,
                            fontSize: '0.82rem',
                            color: '#2563eb',
                            cursor: 'pointer',
                        }}
                    >
                        <Pencil size={13} /> Sửa nhanh
                    </motion.button>
                )
            }
        >
            {selected && (
                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ background: '#fff', borderRadius: 16, padding: '18px 20px', border: '1px solid #f1f5f9' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                            <Avatar
                                size={48}
                                style={{
                                    background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                                    fontWeight: 800,
                                    fontSize: '1.2rem',
                                }}
                            >
                                {avatarChar(selected.userDisplayName)}
                            </Avatar>
                            <div>
                                <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '1rem' }}>
                                    {selected.userDisplayName}
                                </div>
                                <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{selected.userEmail}</div>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
                            {[
                                { label: 'Vai trò', value: roleStyle(selected.userRole).label },
                                { label: 'Trạng thái', value: selected.isRead ? '✅ Đã đọc' : '🔴 Chưa đọc' },
                                { label: 'Thời gian', value: formatDateTimeToMinute(selected.createdAt) || '—' },
                                { label: 'ID thông báo', value: selected.id.slice(0, 12) + '…' },
                            ].map(({ label, value }) => (
                                <div key={label}>
                                    <div
                                        style={{
                                            fontSize: '0.7rem',
                                            color: '#94a3b8',
                                            fontWeight: 600,
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em',
                                        }}
                                    >
                                        {label}
                                    </div>
                                    <div style={{ fontSize: '0.85rem', color: '#0f172a', fontWeight: 600, marginTop: 2 }}>
                                        {value}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div style={{ background: '#fff', borderRadius: 16, padding: '18px 20px', border: '1px solid #f1f5f9' }}>
                        <div
                            style={{
                                fontSize: '0.72rem',
                                color: '#94a3b8',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                marginBottom: 8,
                            }}
                        >
                            Tiêu đề
                        </div>
                        <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '1.0625rem', lineHeight: 1.45 }}>
                            {selected.title}
                        </div>
                    </div>

                    <div style={{ background: '#fff', borderRadius: 16, padding: '18px 20px', border: '1px solid #f1f5f9' }}>
                        <div
                            style={{
                                fontSize: '0.72rem',
                                color: '#94a3b8',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                marginBottom: 10,
                            }}
                        >
                            Nội dung chi tiết
                        </div>
                        <div style={{ color: '#334155', lineHeight: 1.7, fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>
                            {selected.message || (
                                <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Không có nội dung chi tiết.</span>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </Drawer>
    );
};

