import React from 'react';
import { FireFilled, FireOutlined } from '@ant-design/icons';

export interface StreakDisplayMeta {
    title: string;
    shortTitle: string;
    description: string;
    icon: React.ReactNode;
    accent: string;
    iconColor: string;
    iconBackground: string;
    background: string;
    borderColor: string;
    shadow: string;
}

export const getStreakDisplayMeta = (streak: number): StreakDisplayMeta => {
    const safeStreak = Math.max(0, Math.floor(streak));

    if (safeStreak >= 30) {
        return {
            title: `Chuỗi ${safeStreak} ngày`,
            shortTitle: `${safeStreak} Day Streak`,
            description: 'Chuỗi học rất mạnh. Giữ nhịp hôm nay để bảo toàn phong độ.',
            icon: <FireFilled />,
            accent: '#dc2626',
            iconColor: '#fff7ed',
            iconBackground: 'linear-gradient(135deg, #dc2626 0%, #f97316 58%, #facc15 100%)',
            background: 'linear-gradient(135deg, #fff1f2 0%, #ffedd5 52%, #fef3c7 100%)',
            borderColor: '#fed7aa',
            shadow: '0 14px 30px rgba(220, 38, 38, 0.24)',
        };
    }

    if (safeStreak >= 14) {
        return {
            title: `Chuỗi ${safeStreak} ngày`,
            shortTitle: `${safeStreak} Day Streak`,
            description: 'Phong độ rất tốt. Tiếp tục hoàn thành bài mỗi ngày để tăng streak.',
            icon: <FireFilled />,
            accent: '#ea580c',
            iconColor: '#fff7ed',
            iconBackground: 'linear-gradient(135deg, #ea580c 0%, #f97316 64%, #fbbf24 100%)',
            background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
            borderColor: '#fed7aa',
            shadow: '0 12px 26px rgba(234, 88, 12, 0.22)',
        };
    }

    if (safeStreak >= 7) {
        return {
            title: `Chuỗi ${safeStreak} ngày`,
            shortTitle: `${safeStreak} Day Streak`,
            description: 'Bạn đã vào guồng học tập ổn định. Cố giữ thêm vài ngày nữa.',
            icon: <FireFilled />,
            accent: '#f97316',
            iconColor: '#fff7ed',
            iconBackground: 'linear-gradient(135deg, #f97316 0%, #f59e0b 100%)',
            background: 'linear-gradient(135deg, #fff7ed 0%, #fffbeb 100%)',
            borderColor: '#fed7aa',
            shadow: '0 10px 22px rgba(249, 115, 22, 0.18)',
        };
    }

    if (safeStreak >= 1) {
        return {
            title: `Chuỗi ${safeStreak} ngày`,
            shortTitle: `${safeStreak} Day Streak`,
            description: 'Hôm nay hoàn thành thêm ít nhất 1 bài để nối chuỗi.',
            icon: <FireFilled />,
            accent: '#f97316',
            iconColor: '#fff7ed',
            iconBackground: 'linear-gradient(135deg, #fb923c 0%, #f97316 100%)',
            background: 'linear-gradient(135deg, #fff7ed 0%, #eef2ff 100%)',
            borderColor: '#fed7aa',
            shadow: '0 10px 22px rgba(249, 115, 22, 0.16)',
        };
    }

    return {
        title: 'Streak: 0 ngày',
        shortTitle: '0 Day Streak',
        description: 'Hãy bắt đầu luyện tập!',
        icon: <FireOutlined />,
        accent: '#4f46e5',
        iconColor: '#ffffff',
        iconBackground: 'linear-gradient(135deg, #137dc5 0%, #7c3aed 100%)',
        background: 'linear-gradient(135deg, #e0f2fe 0%, #ede9fe 100%)',
        borderColor: '#dbeafe',
        shadow: '0 10px 22px rgba(79, 70, 229, 0.14)',
    };
};
