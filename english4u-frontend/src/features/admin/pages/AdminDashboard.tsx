import { motion } from 'framer-motion';
import { Users, BookOpen, TrendingUp, Activity, ArrowUp, ArrowDown } from 'lucide-react';

const stats = [
    {
        title: 'Tổng học viên',
        value: '1,234',
        change: '+12.5%',
        trend: 'up' as const,
        icon: Users,
        gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    },
    {
        title: 'Đề thi đang mở',
        value: '45',
        change: '+3.2%',
        trend: 'up' as const,
        icon: BookOpen,
        gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    },
    {
        title: 'Doanh thu tháng',
        value: '25.5M',
        change: '+8.1%',
        trend: 'up' as const,
        icon: TrendingUp,
        gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    },
    {
        title: 'Lượt thi hôm nay',
        value: '892',
        change: '-2.4%',
        trend: 'down' as const,
        icon: Activity,
        gradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    },
];

const recentExams = [
    { name: 'IELTS Academic Test 1', type: 'IELTS', attempts: 156, avgScore: 6.5 },
    { name: 'TOEIC Full Test 2025', type: 'TOEIC', attempts: 234, avgScore: 685 },
    { name: 'IELTS General Training', type: 'IELTS', attempts: 89, avgScore: 7.0 },
    { name: 'TOEIC Listening Practice', type: 'TOEIC', attempts: 312, avgScore: 420 },
];

const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.1 },
    },
};

const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
};

export const AdminDashboard = () => {
    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}
        >
            <motion.div variants={itemVariants}>
                <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    Dashboard
                </h2>
                <p style={{ color: '#64748b', marginTop: '4px' }}>Tổng quan hệ thống English4U</p>
            </motion.div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>
                {stats.map((stat) => (
                    <motion.div
                        key={stat.title}
                        variants={itemVariants}
                        whileHover={{ y: -4, boxShadow: '0 20px 40px rgba(0,0,0,0.08)' }}
                        transition={{ type: 'spring', stiffness: 300 }}
                        style={{
                            background: '#fff',
                            borderRadius: '16px',
                            padding: '24px',
                            border: '1px solid #f1f5f9',
                            cursor: 'pointer',
                            position: 'relative',
                            overflow: 'hidden',
                        }}
                    >
                        <div style={{
                            position: 'absolute',
                            top: '-20px',
                            right: '-20px',
                            width: '100px',
                            height: '100px',
                            borderRadius: '50%',
                            background: stat.gradient,
                            opacity: 0.1,
                        }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <p style={{ margin: 0, fontSize: '0.875rem', color: '#94a3b8', fontWeight: 500 }}>{stat.title}</p>
                                <p style={{ margin: '8px 0 0', fontSize: '2rem', fontWeight: 800, color: '#0f172a' }}>{stat.value}</p>
                            </div>
                            <div style={{
                                width: '48px',
                                height: '48px',
                                borderRadius: '12px',
                                background: stat.gradient,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}>
                                <stat.icon size={24} color="#fff" />
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '12px' }}>
                            {stat.trend === 'up' ? (
                                <ArrowUp size={14} color="#10b981" />
                            ) : (
                                <ArrowDown size={14} color="#ef4444" />
                            )}
                            <span style={{
                                fontSize: '0.8125rem',
                                fontWeight: 600,
                                color: stat.trend === 'up' ? '#10b981' : '#ef4444',
                            }}>
                                {stat.change}
                            </span>
                            <span style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>so với tháng trước</span>
                        </div>
                    </motion.div>
                ))}
            </div>

            <motion.div
                variants={itemVariants}
                style={{
                    background: '#fff',
                    borderRadius: '16px',
                    padding: '28px',
                    border: '1px solid #f1f5f9',
                }}
            >
                <h3 style={{ margin: '0 0 20px', fontSize: '1.125rem', fontWeight: 700, color: '#0f172a' }}>
                    Đề thi phổ biến
                </h3>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                {['Tên đề thi', 'Loại', 'Lượt thi', 'Điểm TB'].map(header => (
                                    <th key={header} style={{
                                        textAlign: 'left',
                                        padding: '12px 16px',
                                        fontSize: '0.8125rem',
                                        fontWeight: 600,
                                        color: '#64748b',
                                        borderBottom: '1px solid #f1f5f9',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em',
                                    }}>
                                        {header}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {recentExams.map((exam, i) => (
                                <motion.tr
                                    key={exam.name}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.3 + i * 0.1 }}
                                    style={{ cursor: 'pointer' }}
                                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                                >
                                    <td style={{ padding: '14px 16px', fontWeight: 600, color: '#0f172a' }}>{exam.name}</td>
                                    <td style={{ padding: '14px 16px' }}>
                                        <span style={{
                                            padding: '4px 12px',
                                            borderRadius: '20px',
                                            fontSize: '0.75rem',
                                            fontWeight: 600,
                                            background: exam.type === 'IELTS' ? '#ede9fe' : '#dbeafe',
                                            color: exam.type === 'IELTS' ? '#7c3aed' : '#2563eb',
                                        }}>
                                            {exam.type}
                                        </span>
                                    </td>
                                    <td style={{ padding: '14px 16px', color: '#475569' }}>{exam.attempts}</td>
                                    <td style={{ padding: '14px 16px', fontWeight: 700, color: '#0ea5e9' }}>{exam.avgScore}</td>
                                </motion.tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </motion.div>
        </motion.div>
    );
};
