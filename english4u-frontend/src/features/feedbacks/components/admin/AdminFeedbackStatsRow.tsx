import React from 'react';
import type { FeedbackStats } from '../../types/feedback.types';

interface AdminFeedbackStatsRowProps {
    stats?: FeedbackStats;
    isLoading: boolean;
}

export const AdminFeedbackStatsRow: React.FC<AdminFeedbackStatsRowProps> = ({
    stats,
    isLoading,
}) => {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <div className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-sm">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Tổng phản hồi
                </div>
                <div className="text-2xl font-extrabold text-slate-900 mt-1">
                    {isLoading ? '...' : stats?.total ?? 0}
                </div>
            </div>
            <div className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-sm">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-slate-400" />
                    Đã ghi nhận
                </div>
                <div className="text-2xl font-extrabold text-slate-700 mt-1">
                    {isLoading ? '...' : stats?.received ?? 0}
                </div>
            </div>
            <div className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-sm">
                <div className="text-xs font-semibold text-blue-600 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    Đang xử lý
                </div>
                <div className="text-2xl font-extrabold text-blue-600 mt-1">
                    {isLoading ? '...' : stats?.inProgress ?? 0}
                </div>
            </div>
            <div className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-sm">
                <div className="text-xs font-semibold text-emerald-600 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Đã xử lý
                </div>
                <div className="text-2xl font-extrabold text-emerald-600 mt-1">
                    {isLoading ? '...' : stats?.resolved ?? 0}
                </div>
            </div>
            <div className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-sm">
                <div className="text-xs font-semibold text-rose-600 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    Từ chối
                </div>
                <div className="text-2xl font-extrabold text-rose-600 mt-1">
                    {isLoading ? '...' : stats?.rejected ?? 0}
                </div>
            </div>
        </div>
    );
};

