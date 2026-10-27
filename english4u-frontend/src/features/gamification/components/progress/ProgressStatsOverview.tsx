import React from 'react';
import { Row, Col, Typography } from 'antd';
import {
    TrophyOutlined,
    ClockCircleOutlined,
    FireOutlined,
    CheckCircleOutlined,
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import { palette } from '../../constants/gamification.constants';

const { Title, Text, Paragraph } = Typography;

export interface ProgressStatsSummary {
    totalMinutes: number;
    completedCount: number;
    bestBand: number | null;
    averageBand: number | null;
    skillsDoneCount: number;
    allSkillsAttempted: boolean;
}

interface ProgressStatsOverviewProps {
    stats: ProgressStatsSummary;
    dailyStreakCount: number;
    longestStreakCount: number;
}

export const ProgressStatsOverview: React.FC<ProgressStatsOverviewProps> = ({
    stats,
    dailyStreakCount,
    longestStreakCount,
}) => {
    return (
        <>
            <motion.section
                className="progress-header"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
            >
                <Title level={2} className="header-title">Tiến trình & Phân tích Học tập</Title>
                <Paragraph className="header-desc">
                    Trang theo dõi chi tiết lịch sử làm bài, phân tích năng lực cá nhân và đánh giá gợi ý học tập từ AI.
                </Paragraph>
            </motion.section>

            <Row gutter={[20, 20]} className="stats-row">
                <Col xs={24} sm={12} md={6}>
                    <motion.div className="stat-card glass-card" whileHover={{ y: -3 }}>
                        <div className="stat-icon" style={{ color: palette.indigo, background: `${palette.indigo}12` }}>
                            <TrophyOutlined />
                        </div>
                        <div>
                            <Text className="stat-label">Band Score Cao Nhất</Text>
                            <div className="stat-value">{stats.bestBand !== null ? stats.bestBand.toFixed(1) : '-'}</div>
                            <Text className="stat-sub">Mục tiêu band score 9.0</Text>
                        </div>
                    </motion.div>
                </Col>
                <Col xs={24} sm={12} md={6}>
                    <motion.div className="stat-card glass-card" whileHover={{ y: -3 }}>
                        <div className="stat-icon" style={{ color: palette.blue, background: `${palette.blue}12` }}>
                            <ClockCircleOutlined />
                        </div>
                        <div>
                            <Text className="stat-label">Thời Gian Tích Lũy</Text>
                            <div className="stat-value">
                                {stats.totalMinutes < 60 ? `${stats.totalMinutes} phút` : `${Math.floor(stats.totalMinutes / 60)} giờ`}
                            </div>
                            <Text className="stat-sub">{stats.completedCount} bài đã hoàn thành</Text>
                        </div>
                    </motion.div>
                </Col>
                <Col xs={24} sm={12} md={6}>
                    <motion.div className="stat-card glass-card" whileHover={{ y: -3 }}>
                        <div className="stat-icon" style={{ color: palette.green, background: `${palette.green}12` }}>
                            <CheckCircleOutlined />
                        </div>
                        <div>
                            <Text className="stat-label">Số Kỹ Năng Đã Luyện</Text>
                            <div className="stat-value">{stats.skillsDoneCount}/4</div>
                            <Text className="stat-sub">Đã trải nghiệm {stats.skillsDoneCount} kỹ năng</Text>
                        </div>
                    </motion.div>
                </Col>
                <Col xs={24} sm={12} md={6}>
                    <motion.div className="stat-card glass-card" whileHover={{ y: -3 }}>
                        <div className="stat-icon" style={{ color: palette.orange, background: `${palette.orange}12` }}>
                            <FireOutlined />
                        </div>
                        <div>
                            <Text className="stat-label">Daily Streak</Text>
                            <div className="stat-value">{dailyStreakCount} ngày</div>
                            <Text className="stat-sub">Kỷ lục cũ: {longestStreakCount} ngày</Text>
                        </div>
                    </motion.div>
                </Col>
            </Row>
        </>
    );
};

