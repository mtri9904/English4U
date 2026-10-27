import React from 'react';
import { Alert } from 'antd';
import type { PracticeSessionRewardDto } from '../../types/session.types';

interface SubmitRewardAlertProps {
    reward: PracticeSessionRewardDto | null;
}

export const SubmitRewardAlert: React.FC<SubmitRewardAlertProps> = ({ reward }) => {
    if (!reward || reward.dailyStreakCount <= 0) {
        return null;
    }

    return (
        <Alert
            type="success"
            showIcon
            message={`Chuỗi học tập đã cập nhật: 🔥 ${reward.dailyStreakCount} ngày liên tiếp`}
            description="Tuyệt vời! Bạn đã hoàn thành bài thi hôm nay và duy trì chuỗi học tập liên tục."
            style={{
                borderRadius: 18,
                border: '1px solid #bbf7d0',
                boxShadow: '0 12px 28px rgba(15, 23, 42, 0.06)',
            }}
        />
    );
};

