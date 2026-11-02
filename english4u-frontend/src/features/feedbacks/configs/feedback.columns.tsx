import type { ColumnsType } from 'antd/es/table';
import { Button, Tag, Tooltip, message } from 'antd';
import { Copy, Clock } from 'lucide-react';
import type {
    FeedbackListItem,
    FeedbackPriority,
    FeedbackStatus,
    FeedbackType,
} from '../types/feedback.types';
import {
    FEEDBACK_PRIORITIES,
    FEEDBACK_STATUSES,
    FEEDBACK_TYPES,
} from '../constants/feedback.constants';

interface CreateFeedbackColumnsOptions {
    onSelectFeedback: (item: FeedbackListItem) => void;
}

export const createFeedbackColumns = ({
    onSelectFeedback,
}: CreateFeedbackColumnsOptions): ColumnsType<FeedbackListItem> => {
    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        message.success(`Đã sao chép: ${text}`);
    };

    return [
        {
            title: 'Mã phản hồi',
            dataIndex: 'code',
            key: 'code',
            width: 170,
            render: (code: string) => (
                <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-slate-700">
                    <span>{code}</span>
                    <Tooltip title="Sao chép">
                        <button
                            type="button"
                            onClick={() => handleCopy(code)}
                            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                        >
                            <Copy size={12} />
                        </button>
                    </Tooltip>
                </div>
            ),
        },
        {
            title: 'Tiêu đề',
            key: 'title',
            render: (_: unknown, record: FeedbackListItem) => (
                <div
                    className="font-semibold text-sm text-slate-900 hover:text-blue-600 cursor-pointer transition-colors"
                    onClick={() => onSelectFeedback(record)}
                >
                    {record.title}
                </div>
            ),
        },
        {
            title: 'Phân loại',
            dataIndex: 'type',
            key: 'type',
            width: 150,
            render: (type: FeedbackType) => {
                const config = FEEDBACK_TYPES[type] ?? FEEDBACK_TYPES.OTHER;
                const Icon = config.icon;
                return (
                    <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold"
                        style={{
                            background: config.bgLight,
                            color: config.color,
                            border: `1px solid ${config.borderColor}30`,
                        }}
                    >
                        <Icon size={13} />
                        {config.label}
                    </span>
                );
            },
        },
        {
            title: 'Mức độ',
            dataIndex: 'priority',
            key: 'priority',
            width: 120,
            render: (priority: FeedbackPriority) => {
                const config = FEEDBACK_PRIORITIES[priority] ?? FEEDBACK_PRIORITIES.MEDIUM;
                const Icon = config.icon;
                return (
                    <span
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold"
                        style={{
                            background: config.bgLight,
                            color: config.color,
                            border: `1px solid ${config.borderColor}30`,
                        }}
                    >
                        <Icon size={12} />
                        {config.label}
                    </span>
                );
            },
        },
        {
            title: 'Người gửi',
            key: 'sender',
            width: 180,
            render: (_: unknown, record: FeedbackListItem) => (
                <div className="text-xs">
                    <div className="font-medium text-slate-800">{record.senderName}</div>
                    <div className="text-slate-500 text-[11px]">{record.senderRole}</div>
                </div>
            ),
        },
        {
            title: 'Trạng thái',
            dataIndex: 'status',
            key: 'status',
            width: 130,
            render: (status: FeedbackStatus) => {
                const config = FEEDBACK_STATUSES[status] ?? FEEDBACK_STATUSES.RECEIVED;
                return (
                    <Tag
                        color={config.tagColor}
                        className="inline-flex items-center gap-1.5 font-medium text-xs px-2.5 py-0.5 rounded-full"
                    >
                        <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ background: config.dotColor }}
                        />
                        {config.label}
                    </Tag>
                );
            },
        },
        {
            title: 'Thời gian',
            dataIndex: 'createdAt',
            key: 'createdAt',
            width: 140,
            render: (createdAt: string) => (
                <div className="text-xs text-slate-500 flex items-center gap-1">
                    <Clock size={11} className="text-slate-400" />
                    <span>{createdAt}</span>
                </div>
            ),
        },
        {
            title: 'Thao tác',
            key: 'actions',
            width: 120,
            render: (_: unknown, record: FeedbackListItem) => (
                <Button
                    type="link"
                    size="small"
                    onClick={() => onSelectFeedback(record)}
                    className="font-semibold text-blue-600 hover:text-blue-700 p-0"
                >
                    Xử lý & Xem
                </Button>
            ),
        },
    ];
};

