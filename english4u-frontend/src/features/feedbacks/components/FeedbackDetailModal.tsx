import React, { useState } from 'react';
import { Modal, Spin, Image, Tooltip, message } from 'antd';
import {
    X,
    User,
    Shield,
    Clock,
    Laptop,
    CheckCircle2,
    Copy,
    Lightbulb,
    FileText,
} from 'lucide-react';
import { useFeedbackDetailQuery } from '../hooks/useFeedbackQueries';
import { FEEDBACK_PRIORITIES, FEEDBACK_STATUSES, FEEDBACK_TYPES, formatMediaUrl } from '../constants/feedback.constants';

interface FeedbackDetailModalProps {
    feedbackId?: string | null;
    open: boolean;
    onClose: () => void;
}

export const FeedbackDetailModal: React.FC<FeedbackDetailModalProps> = ({
    feedbackId,
    open,
    onClose,
}) => {
    const { data: detail, isLoading } = useFeedbackDetailQuery(feedbackId || undefined, {
        enabled: open && !!feedbackId,
    });
    const [copied, setCopied] = useState(false);

    const handleCopyCode = () => {
        if (!detail?.code) return;
        navigator.clipboard.writeText(detail.code);
        setCopied(true);
        message.success('Đã sao chép mã phản hồi!');
        setTimeout(() => setCopied(false), 2000);
    };

    const typeConfig = detail ? FEEDBACK_TYPES[detail.type] ?? FEEDBACK_TYPES.OTHER : FEEDBACK_TYPES.OTHER;
    const priorityConfig = detail
        ? FEEDBACK_PRIORITIES[detail.priority] ?? FEEDBACK_PRIORITIES.MEDIUM
        : FEEDBACK_PRIORITIES.MEDIUM;
    const statusConfig = detail
        ? FEEDBACK_STATUSES[detail.status] ?? FEEDBACK_STATUSES.RECEIVED
        : FEEDBACK_STATUSES.RECEIVED;
    const TypeIcon = typeConfig.icon;
    const PriorityIcon = priorityConfig.icon;

    return (
        <Modal
            open={open}
            onCancel={onClose}
            footer={null}
            width={760}
            closable={false}
            centered
            className="feedback-detail-modal"
            styles={{
                content: {
                    background: '#131926',
                    borderRadius: 20,
                    border: '1px solid #1e293b',
                    padding: 0,
                    overflow: 'hidden',
                    color: '#f8fafc',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
                },
            }}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800/80 bg-[#151c2e]">
                <div className="flex items-center gap-3">
                    <h2 className="text-lg font-bold text-white tracking-wide m-0">Chi tiết phản hồi</h2>
                    {detail && (
                        <>
                            <button
                                type="button"
                                onClick={handleCopyCode}
                                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium rounded-md bg-slate-800/90 text-slate-300 border border-slate-700 hover:border-slate-500 hover:text-white transition-colors"
                            >
                                <span>{detail.code}</span>
                                <Tooltip title={copied ? 'Đã chép' : 'Sao chép mã'}>
                                    <Copy size={12} className="opacity-70" />
                                </Tooltip>
                            </button>
                            <span
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full"
                                style={{
                                    background: `${statusConfig.color}22`,
                                    color: statusConfig.color,
                                    border: `1px solid ${statusConfig.color}44`,
                                }}
                            >
                                <span
                                    className="w-1.5 h-1.5 rounded-full"
                                    style={{ background: statusConfig.color }}
                                />
                                {statusConfig.label}
                            </span>
                        </>
                    )}
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                    <X size={20} />
                </button>
            </div>

            {/* Body */}
            <div className="p-6 max-h-[78vh] overflow-y-auto space-y-6 scrollbar-thin scrollbar-thumb-slate-700">
                {isLoading || !detail ? (
                    <div className="py-24 flex flex-col items-center justify-center gap-3">
                        <Spin size="large" />
                        <span className="text-sm text-slate-400">Đang tải thông tin phản hồi...</span>
                    </div>
                ) : (
                    <>
                        {/* Hero Card */}
                        <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-800/70 to-slate-900/90 border border-slate-700/60 shadow-lg">
                            <div className="flex flex-wrap items-center gap-2 mb-3">
                                <span
                                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold"
                                    style={{
                                        background: typeConfig.bgLight,
                                        color: typeConfig.color,
                                        border: `1px solid ${typeConfig.color}40`,
                                    }}
                                >
                                    <TypeIcon size={14} />
                                    {typeConfig.label}
                                </span>
                                <span
                                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold"
                                    style={{
                                        background: priorityConfig.bgLight,
                                        color: priorityConfig.color,
                                        border: `1px solid ${priorityConfig.color}40`,
                                    }}
                                >
                                    <PriorityIcon size={14} />
                                    {priorityConfig.label}
                                </span>
                            </div>
                            <h3 className="text-xl font-bold text-white tracking-normal leading-snug m-0">
                                {detail.title}
                            </h3>
                        </div>

                        {/* Metadata Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                            {/* Người gửi */}
                            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
                                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
                                    <User size={18} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="text-xs text-slate-400 font-medium">Người gửi</div>
                                    <div className="text-sm font-semibold text-slate-100 truncate mt-0.5">
                                        {detail.senderName}
                                        <span className="text-xs font-normal text-slate-400 ml-1.5">
                                            ({detail.senderRole})
                                        </span>
                                    </div>
                                    {detail.senderEmail && (
                                        <div className="text-xs text-slate-500 truncate">{detail.senderEmail}</div>
                                    )}
                                </div>
                            </div>

                            {/* Người phụ trách */}
                            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
                                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                                    <Shield size={18} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="text-xs text-slate-400 font-medium">Người phụ trách</div>
                                    <div className="text-sm font-semibold text-amber-300 truncate mt-0.5">
                                        {detail.assignedAdminName || 'Ban Quản trị English4U'}
                                    </div>
                                    <div className="text-xs text-slate-400">Đội ngũ kỹ thuật & vận hành</div>
                                </div>
                            </div>

                            {/* Thời gian gửi */}
                            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
                                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 shrink-0">
                                    <Clock size={18} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="text-xs text-slate-400 font-medium">Thời gian gửi</div>
                                    <div className="text-sm font-semibold text-slate-200 mt-0.5">
                                        {detail.createdAt}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Mô tả chi tiết */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs font-semibold text-slate-300 uppercase tracking-wider">
                                <span className="flex items-center gap-1.5">
                                    <FileText size={14} className="text-blue-400" />
                                    Mô tả chi tiết
                                </span>
                                {detail.browserInfo && (
                                    <span className="flex items-center gap-1.5 text-slate-400 normal-case font-normal text-xs">
                                        <Laptop size={13} />
                                        <span>Trình duyệt web</span>
                                    </span>
                                )}
                            </div>
                            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                                {detail.description}
                            </div>
                        </div>

                        {/* Đề xuất giải pháp (nếu có) */}
                        {detail.suggestedSolution && (
                            <div className="space-y-2">
                                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300 uppercase tracking-wider">
                                    <Lightbulb size={14} />
                                    Đề xuất giải pháp
                                </div>
                                <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-900/30 text-sm text-amber-100 whitespace-pre-wrap leading-relaxed">
                                    {detail.suggestedSolution}
                                </div>
                            </div>
                        )}

                        {/* Hình ảnh đính kèm (nếu có) */}
                        {detail.attachments && detail.attachments.length > 0 && (
                            <div className="space-y-2">
                                <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                                    Hình ảnh / Bằng chứng đính kèm ({detail.attachments.length})
                                </div>
                                <Image.PreviewGroup>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        {detail.attachments.map((imgUrl, index) => (
                                            <div
                                                key={index}
                                                className="relative aspect-video rounded-xl overflow-hidden border border-slate-700/80 bg-slate-900 group"
                                            >
                                                <Image
                                                    src={formatMediaUrl(imgUrl)}
                                                    alt={`evidence-${index}`}
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                    wrapperClassName="w-full h-full"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </Image.PreviewGroup>
                            </div>
                        )}

                        {/* Thông tin trình duyệt */}
                        {detail.browserInfo && (
                            <div className="space-y-2">
                                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                    <Laptop size={13} />
                                    Thông tin trình duyệt
                                </div>
                                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-900 font-mono text-xs text-slate-400 break-all leading-normal">
                                    {detail.browserInfo}
                                </div>
                            </div>
                        )}

                        {/* Lịch sử tiến độ & nhật ký xử lý */}
                        <div className="space-y-3 pt-2 border-t border-slate-800/80">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-xs font-bold text-slate-200 uppercase tracking-wider">
                                    <Clock size={14} className="text-blue-400" />
                                    <span>Lịch sử tiến độ & nhật ký xử lý</span>
                                </div>
                                <span className="text-xs text-slate-400 font-medium">
                                    {detail.activityLogs?.length || 0} mốc
                                </span>
                            </div>

                            <div className="relative pl-6 space-y-4 before:content-[''] before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-800">
                                {detail.activityLogs && detail.activityLogs.length > 0 ? (
                                    detail.activityLogs.map((log) => {
                                        const logStatusConfig =
                                            FEEDBACK_STATUSES[log.status] ?? FEEDBACK_STATUSES.RECEIVED;
                                        return (
                                            <div key={log.id} className="relative group">
                                                {/* Dot / Icon on timeline line */}
                                                <div
                                                    className="absolute -left-6 top-2 w-5 h-5 rounded-full flex items-center justify-center border-2 border-[#131926] shadow"
                                                    style={{ background: logStatusConfig.color }}
                                                >
                                                    <CheckCircle2 size={12} className="text-white" />
                                                </div>

                                                {/* Content card */}
                                                <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 group-hover:border-slate-700 transition-colors">
                                                    <div className="flex items-center justify-between gap-2 mb-2">
                                                        <div className="flex items-center gap-2">
                                                            <span
                                                                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium"
                                                                style={{
                                                                    background: `${logStatusConfig.color}22`,
                                                                    color: logStatusConfig.color,
                                                                    border: `1px solid ${logStatusConfig.color}44`,
                                                                }}
                                                            >
                                                                <span
                                                                    className="w-1.5 h-1.5 rounded-full"
                                                                    style={{ background: logStatusConfig.color }}
                                                                />
                                                                {logStatusConfig.label}
                                                            </span>
                                                            {log.isCurrent && (
                                                                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-orange-500/20 text-orange-400 border border-orange-500/40">
                                                                    Hiện tại
                                                                </span>
                                                            )}
                                                        </div>
                                                        <span className="text-xs text-slate-400">
                                                            {log.createdAt}
                                                        </span>
                                                    </div>

                                                    <p className="text-sm text-slate-200 m-0 mb-2 leading-relaxed">
                                                        {log.note || 'Không có ghi chú'}
                                                    </p>

                                                    <div className="flex items-center gap-1.5 text-xs text-slate-400 pt-2 border-t border-slate-800/60">
                                                        <User size={13} className="text-slate-500" />
                                                        <span className="font-medium text-slate-300">
                                                            {log.actorName}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="text-xs text-slate-500 py-2">
                                        Chưa có tiến độ ghi nhận
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end px-6 py-4 border-t border-slate-800/80 bg-[#151c2e]">
                <button
                    type="button"
                    onClick={onClose}
                    className="px-5 py-2 text-sm font-medium rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                >
                    Đóng
                </button>
            </div>
        </Modal>
    );
};

