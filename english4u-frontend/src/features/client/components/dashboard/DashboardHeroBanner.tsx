import React from 'react';
import { Avatar, Button, Progress, Space, Tag, Typography } from 'antd';
import { PlayCircleOutlined, RocketOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import { palette, statusLabelMap } from '../../constants/client.constants';
import { fadeIn, formatBand } from '../../utils/client.utils';
import { getSessionRunnerPath } from '@/features/exam-taking';
import type { PracticeSessionListItemDto } from '@/features/exam-taking';

const { Title, Paragraph, Text } = Typography;

export interface WeakestSkillInfo {
    skill: string;
    label: string;
    averageBand: number | null;
}

export interface StreakDisplayMetaInfo {
    accent: string;
    borderColor: string;
    background: string;
    iconBackground: string;
    iconColor: string;
    icon: React.ReactNode;
    shortTitle: string;
}

export interface DashboardHeroBannerProps {
    profile?: {
        avatarUrl?: string | null;
        displayName?: string | null;
    } | null;
    firstName: string;
    streakMeta: StreakDisplayMetaInfo;
    longestStreak: number;
    activeSession: PracticeSessionListItemDto | null;
    weakestSkill: WeakestSkillInfo | null;
    estimatedOverallBand: number | null;
    onNavigate: (path: string) => void;
}

export const DashboardHeroBanner: React.FC<DashboardHeroBannerProps> = ({
    profile,
    firstName,
    streakMeta,
    longestStreak,
    activeSession,
    weakestSkill,
    estimatedOverallBand,
    onNavigate,
}) => {
    return (
        <motion.section className="dashboard-hero glass-card" {...fadeIn(0)}>
            <div className="hero-main">
                <div className="hero-copy">
                    <Space size={12} align="center" wrap>
                        <Avatar size={48} src={profile?.avatarUrl} className="hero-avatar">
                            {profile?.displayName?.charAt(0)?.toUpperCase() || 'U'}
                        </Avatar>
                        <div>
                            <Text className="eyebrow">Welcome back, {firstName}</Text>
                            <Title level={2} className="hero-title">
                                Giữ nhịp luyện IELTS hôm nay
                            </Title>
                        </div>
                    </Space>

                    <div className="hero-tags">
                        <Tag
                            className="streak-pill"
                            style={{
                                color: streakMeta.accent,
                                borderColor: streakMeta.borderColor,
                                background: streakMeta.background,
                            }}
                        >
                            <span
                                className="streak-pill-icon"
                                style={{
                                    background: streakMeta.iconBackground,
                                    color: streakMeta.iconColor,
                                }}
                            >
                                {streakMeta.icon}
                            </span>
                            {streakMeta.shortTitle}
                        </Tag>
                        <Tag className="soft-pill">Kỷ lục {longestStreak} ngày</Tag>
                    </div>

                    <Paragraph className="hero-desc">
                        Dashboard tập trung vào điểm hiện tại, kỹ năng yếu nhất và nhiệm vụ nên làm tiếp theo.
                    </Paragraph>
                </div>

                <div className="hero-action">
                    <Text className="eyebrow">Today's Focus</Text>
                    <Title level={4} className="focus-title">
                        {activeSession
                            ? activeSession.examTitle
                            : weakestSkill
                              ? `Luyện ${weakestSkill.label}`
                              : 'Bắt đầu bài luyện đầu tiên'}
                    </Title>
                    <Text className="focus-note">
                        {activeSession
                            ? `${activeSession.answeredQuestions}/${activeSession.totalQuestions} câu - ${statusLabelMap[activeSession.status] ?? activeSession.status}`
                            : weakestSkill
                              ? `Band trung bình ${formatBand(weakestSkill.averageBand)}`
                              : 'Hoàn thành 1 task để duy trì chuỗi học streak.'}
                    </Text>
                    <Button
                        type="primary"
                        size="large"
                        icon={activeSession ? <PlayCircleOutlined /> : <RocketOutlined />}
                        onClick={() => {
                            if (activeSession) {
                                onNavigate(getSessionRunnerPath(activeSession.sessionId, activeSession.skillType));
                                return;
                            }

                            onNavigate(`/app/practice${weakestSkill ? `?skill=${weakestSkill.skill}` : ''}`);
                        }}
                    >
                        {activeSession ? 'Tiếp tục bài' : 'Luyện ngay'}
                    </Button>
                </div>
            </div>

            <div className="band-panel">
                <Text className="eyebrow">Estimated Overall Band</Text>
                <div className="band-number">{formatBand(estimatedOverallBand)}</div>
                <Progress
                    percent={estimatedOverallBand != null ? Math.round((estimatedOverallBand / 9) * 100) : 0}
                    showInfo={false}
                    strokeColor={palette.indigo}
                    trailColor="rgba(79, 70, 229, 0.12)"
                />
                <div className="band-footer">
                    <span>Mục tiêu IELTS</span>
                    <span>Band 9.0</span>
                </div>
            </div>
        </motion.section>
    );
};

