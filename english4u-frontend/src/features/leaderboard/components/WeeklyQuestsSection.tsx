import React from 'react';
import { Card, Button, Progress, Tag } from 'antd';
import {
    ClockCircleOutlined,
    CheckCircleFilled,
    GiftFilled,
    ArrowRightOutlined,
    ThunderboltFilled,
    ReadOutlined,
    FireFilled,
    CustomerServiceOutlined,
    TrophyFilled,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { WeeklyQuest } from '../types/leaderboard.types';
import { useClaimQuestRewardMutation } from '../hooks/useLeaderboardQueries';

interface WeeklyQuestsSectionProps {
    quests: WeeklyQuest[];
}

const renderQuestIcon = (icon: string) => {
    switch (icon) {
        case '📖':
        case 'reading':
            return <ReadOutlined style={{ color: '#2563eb' }} />;
        case '🔥':
        case 'streak':
            return <FireFilled style={{ color: '#f97316' }} />;
        case '🎧':
        case 'dictation':
            return <CustomerServiceOutlined style={{ color: '#8b5cf6' }} />;
        case '⚡':
        case 'flashcard':
            return <ThunderboltFilled style={{ color: '#eab308' }} />;
        case '🏆':
        case 'exam':
            return <TrophyFilled style={{ color: '#10b981' }} />;
        default:
            return <TrophyFilled style={{ color: '#2563eb' }} />;
    }
};

export const WeeklyQuestsSection: React.FC<WeeklyQuestsSectionProps> = ({ quests }) => {
    const navigate = useNavigate();
    const claimMutation = useClaimQuestRewardMutation();

    const daysRemaining = quests[0]?.remainingDays ?? 3;

    return (
        <div>
            {/* Header with Countdown timer */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                    marginBottom: '20px',
                }}
            >
                <div>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>
                        Thử Thách Tuần Này (Weekly Quests) 🎯
                    </h2>
                    <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
                        Nhiệm vụ làm mới mỗi Chủ Nhật hàng tuần. Hoàn thành để tích lũy XP và bứt phá trên Bảng xếp hạng!
                    </p>
                </div>

                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: '#fef3c7',
                        border: '1px solid #fde68a',
                        padding: '8px 14px',
                        borderRadius: '12px',
                        fontSize: '13px',
                        fontWeight: 700,
                        color: '#92400e',
                    }}
                >
                    <ClockCircleOutlined />
                    <span>Làm mới sau {daysRemaining} ngày</span>
                </div>
            </div>

            {/* Quests List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {quests.map((quest) => {
                    const percent = Math.min(
                        100,
                        Math.round((quest.currentProgress / quest.targetProgress) * 100)
                    );

                    return (
                        <Card
                            key={quest.id}
                            bordered={false}
                            style={{
                                borderRadius: '16px',
                                background: quest.isCompleted
                                    ? quest.isClaimed
                                        ? '#f8fafc'
                                        : 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)'
                                    : '#fff',
                                border: quest.isCompleted
                                    ? quest.isClaimed
                                        ? '1px solid #e2e8f0'
                                        : '1.5px solid #86efac'
                                    : '1px solid #e2e8f0',
                                boxShadow: '0 4px 14px rgba(15, 23, 42, 0.04)',
                                transition: 'all 0.2s ease',
                            }}
                            bodyStyle={{ padding: '18px 22px' }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    flexWrap: 'wrap',
                                    gap: '16px',
                                }}
                            >
                                {/* Left icon & quest info */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, minWidth: '280px' }}>
                                    <div
                                        style={{
                                            width: '50px',
                                            height: '50px',
                                            borderRadius: '14px',
                                            background: quest.isCompleted ? '#dcfce7' : '#eff6ff',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '24px',
                                            flexShrink: 0,
                                        }}
                                    >
                                        {renderQuestIcon(quest.icon)}
                                    </div>

                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                                                {quest.title}
                                            </h3>
                                            <Tag
                                                color="gold"
                                                style={{
                                                    margin: 0,
                                                    fontWeight: 700,
                                                    fontSize: '11px',
                                                    borderRadius: '8px',
                                                    background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                                                    border: '1px solid #facc15',
                                                    color: '#92400e',
                                                }}
                                            >
                                                <ThunderboltFilled /> +{quest.xpReward} XP
                                            </Tag>
                                        </div>
                                        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
                                            {quest.description}
                                        </p>
                                    </div>
                                </div>

                                {/* Right: Progress & Action */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '18px', minWidth: '260px', justifyContent: 'flex-end' }}>
                                    {/* Progress bar */}
                                    <div style={{ width: '130px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                                            <span>Tiến trình</span>
                                            <span>{quest.progressLabel}</span>
                                        </div>
                                        <Progress
                                            percent={percent}
                                            size="small"
                                            strokeColor={quest.isCompleted ? '#16a34a' : '#2563eb'}
                                            showInfo={false}
                                        />
                                    </div>

                                    {/* Action button */}
                                    {quest.isClaimed ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#16a34a', fontWeight: 700, fontSize: '13px' }}>
                                            <CheckCircleFilled />
                                            <span>Đã nhận thưởng</span>
                                        </div>
                                    ) : quest.isCompleted ? (
                                        <Button
                                            type="primary"
                                            icon={<GiftFilled />}
                                            loading={claimMutation.isPending}
                                            onClick={() => claimMutation.mutate(quest.id)}
                                            style={{
                                                background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                                                borderRadius: '10px',
                                                fontWeight: 700,
                                                height: '38px',
                                                boxShadow: '0 4px 14px rgba(22, 163, 74, 0.3)',
                                            }}
                                        >
                                            Nhận +{quest.xpReward} XP
                                        </Button>
                                    ) : (
                                        <Button
                                            onClick={() => navigate(quest.actionUrl)}
                                            icon={<ArrowRightOutlined />}
                                            style={{
                                                borderRadius: '10px',
                                                fontWeight: 600,
                                                height: '38px',
                                            }}
                                        >
                                            Làm ngay
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
};

