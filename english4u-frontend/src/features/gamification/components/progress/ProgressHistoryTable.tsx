import React from 'react';
import { Table, Select, Typography, Tag, Button, Empty } from 'antd';
import { RightOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import { formatDateTimeToMinute } from '@/shared/lib/dateTime';
import { skillMeta, type ProgressSkillKey } from '../../constants/gamification.constants';

const { Title, Text } = Typography;

export interface HistoryTableRecord {
    key: string;
    title: string;
    skill: string;
    score: number | null;
    duration: number;
    completedAt: string;
}

interface ProgressHistoryTableProps {
    historySkill: string;
    onChangeHistorySkill: (skill: string) => void;
    tableData: HistoryTableRecord[];
    onNavigateToSessionSubmit: (sessionId: string) => void;
}

export const ProgressHistoryTable: React.FC<ProgressHistoryTableProps> = ({
    historySkill,
    onChangeHistorySkill,
    tableData,
    onNavigateToSessionSubmit,
}) => {
    return (
        <motion.section
            className="section-panel glass-card"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.25 }}
        >
            <div className="panel-head">
                <div>
                    <Text className="eyebrow">Practice History</Text>
                    <Title level={4} className="panel-title">Chi Tiết Các Lượt Làm Bài</Title>
                </div>
                <Select
                    value={historySkill}
                    onChange={onChangeHistorySkill}
                    style={{ width: 160 }}
                    options={[
                        { value: 'ALL', label: 'Tất cả kỹ năng' },
                        { value: 'READING', label: 'Reading' },
                        { value: 'LISTENING', label: 'Listening' },
                        { value: 'WRITING', label: 'Writing' },
                        { value: 'SPEAKING', label: 'Speaking' },
                    ]}
                />
            </div>

            <Table
                dataSource={tableData}
                pagination={{ pageSize: 6, showSizeChanger: false }}
                className="custom-table"
                locale={{ emptyText: <Empty description="Chưa có dữ liệu làm bài thi." image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                columns={[
                    {
                        title: 'Tên đề thi',
                        dataIndex: 'title',
                        key: 'title',
                        className: 'table-col-title',
                        render: (text) => <span className="font-semibold text-slate-800">{text}</span>,
                    },
                    {
                        title: 'Kỹ năng',
                        dataIndex: 'skill',
                        key: 'skill',
                        render: (skill: string) => {
                            const meta = skillMeta[skill as ProgressSkillKey];
                            return (
                                <Tag color={skill === 'READING' ? 'blue' : skill === 'LISTENING' ? 'purple' : skill === 'WRITING' ? 'orange' : 'green'}>
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
                        render: (val: string) => <span className="text-slate-400">{formatDateTimeToMinute(val)}</span>,
                    },
                    {
                        title: 'Hành động',
                        key: 'actions',
                        align: 'center',
                        render: (_, record) => (
                            <Button
                                type="text"
                                icon={<RightOutlined />}
                                className="table-action-btn"
                                onClick={() => onNavigateToSessionSubmit(record.key)}
                            />
                        ),
                    },
                ]}
            />
        </motion.section>
    );
};

