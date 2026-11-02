import type { ColumnsType } from 'antd/es/table';
import { Button, Tag } from 'antd';
import { RightOutlined } from '@ant-design/icons';
import { formatDateTimeToMinute } from '@/shared/lib/dateTime';
import { skillMeta, type ProgressSkillKey } from '../constants/gamification.constants';

export interface HistoryTableRecord {
    key: string;
    title: string;
    skill: string;
    score: number | null;
    duration: number;
    completedAt: string;
}

export interface CreateProgressHistoryColumnsOptions {
    onNavigateToSessionSubmit: (sessionId: string) => void;
}

export const createProgressHistoryColumns = ({
    onNavigateToSessionSubmit,
}: CreateProgressHistoryColumnsOptions): ColumnsType<HistoryTableRecord> => [
    {
        title: 'Tên đề thi',
        dataIndex: 'title',
        key: 'title',
        className: 'table-col-title',
        render: (text: string) => <span className="font-semibold text-slate-800">{text}</span>,
    },
    {
        title: 'Kỹ năng',
        dataIndex: 'skill',
        key: 'skill',
        render: (skill: string) => {
            const meta = skillMeta[skill as ProgressSkillKey];
            return (
                <Tag
                    color={
                        skill === 'READING'
                            ? 'blue'
                            : skill === 'LISTENING'
                            ? 'purple'
                            : skill === 'WRITING'
                            ? 'orange'
                            : 'green'
                    }
                >
                    {meta?.label ?? skill}
                </Tag>
            );
        },
    },
    {
        title: 'Điểm số',
        dataIndex: 'score',
        key: 'score',
        render: (val: number | null) => (
            <span className="font-bold text-slate-900">{val !== null ? val.toFixed(1) : '-'}</span>
        ),
    },
    {
        title: 'Thời gian',
        dataIndex: 'duration',
        key: 'duration',
        render: (mins: number) => <span className="text-slate-500">{mins} phút</span>,
    },
    {
        title: 'Ngày hoàn thành',
        dataIndex: 'completedAt',
        key: 'completedAt',
        render: (val: string) => (
            <span className="text-slate-400">{formatDateTimeToMinute(val)}</span>
        ),
    },
    {
        title: 'Hành động',
        key: 'actions',
        align: 'center',
        render: (_, record: HistoryTableRecord) => (
            <Button
                type="text"
                icon={<RightOutlined />}
                className="table-action-btn"
                onClick={() => onNavigateToSessionSubmit(record.key)}
            />
        ),
    },
];

