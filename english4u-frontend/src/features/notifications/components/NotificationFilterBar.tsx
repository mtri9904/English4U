import React from 'react';
import { motion } from 'framer-motion';
import { Search, X, Filter, RefreshCw } from 'lucide-react';
import { ROLE_OPTIONS, type ReadFilter, type RoleFilter } from '../constants/notification.constants';

const cardAnim = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 280, damping: 22 } },
} as const;

interface NotificationFilterBarProps {
    search: string;
    roleFilter: RoleFilter;
    readFilter: ReadFilter;
    isFetching: boolean;
    onSearchChange: (v: string) => void;
    onRoleChange: (v: RoleFilter) => void;
    onReadChange: (v: ReadFilter) => void;
    onRefresh: () => void;
}

export const NotificationFilterBar: React.FC<NotificationFilterBarProps> = ({
    search,
    roleFilter,
    readFilter,
    isFetching,
    onSearchChange,
    onRoleChange,
    onReadChange,
    onRefresh,
}) => {
    return (
        <motion.div
            variants={cardAnim}
            style={{
                background: '#fff',
                borderRadius: 16,
                padding: '14px 18px',
                border: '1px solid #f1f5f9',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
            }}
        >
            <div style={{ position: 'relative', flex: 2, minWidth: 220 }}>
                <Search
                    size={15}
                    color="#94a3b8"
                    style={{
                        position: 'absolute',
                        left: 11,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        pointerEvents: 'none',
                    }}
                />
                <input
                    value={search}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder="Tìm tiêu đề, nội dung, tên hoặc email..."
                    style={{
                        width: '100%',
                        paddingLeft: 34,
                        paddingRight: 12,
                        height: 38,
                        border: '1px solid #e2e8f0',
                        borderRadius: 10,
                        outline: 'none',
                        fontSize: '0.875rem',
                        color: '#0f172a',
                        background: '#f8fafc',
                        boxSizing: 'border-box',
                    }}
                    onFocus={(e) => (e.target.style.borderColor = '#6366f1')}
                    onBlur={(e) => (e.target.style.borderColor = '#e2e8f0')}
                />
                {search && (
                    <button
                        onClick={() => onSearchChange('')}
                        style={{
                            position: 'absolute',
                            right: 10,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 0,
                            display: 'flex',
                        }}
                    >
                        <X size={13} color="#94a3b8" />
                    </button>
                )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f1f5f9', borderRadius: 10, padding: '3px 4px' }}>
                <Filter size={13} color="#94a3b8" style={{ marginLeft: 6 }} />
                {ROLE_OPTIONS.map((o) => (
                    <button
                        key={o.value}
                        onClick={() => onRoleChange(o.value)}
                        style={{
                            padding: '5px 11px',
                            borderRadius: 7,
                            border: 'none',
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontSize: '0.78rem',
                            background: roleFilter === o.value ? '#fff' : 'transparent',
                            color: roleFilter === o.value ? '#0f172a' : '#64748b',
                            boxShadow: roleFilter === o.value ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                            transition: 'all 0.15s',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {o.label}
                    </button>
                ))}
            </div>

            <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 10, padding: 3, gap: 2 }}>
                {(['ALL', 'unread', 'read'] as ReadFilter[]).map((v) => (
                    <button
                        key={v}
                        onClick={() => onReadChange(v)}
                        style={{
                            padding: '5px 12px',
                            borderRadius: 7,
                            border: 'none',
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontSize: '0.78rem',
                            background: readFilter === v ? '#fff' : 'transparent',
                            color: readFilter === v ? '#0f172a' : '#64748b',
                            boxShadow: readFilter === v ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                            transition: 'all 0.15s',
                        }}
                    >
                        {v === 'ALL' ? 'Tất cả' : v === 'unread' ? '🔴 Chưa đọc' : '✅ Đã đọc'}
                    </button>
                ))}
            </div>

            <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                onClick={onRefresh}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 14px',
                    borderRadius: 10,
                    border: '1px solid #e2e8f0',
                    background: '#fff',
                    fontWeight: 600,
                    fontSize: '0.82rem',
                    color: '#475569',
                    cursor: 'pointer',
                    marginLeft: 'auto',
                }}
            >
                <RefreshCw size={13} style={{ animation: isFetching ? 'spin 1s linear infinite' : 'none' }} />
                Làm mới
            </motion.button>
        </motion.div>
    );
};

