import React, { useMemo } from 'react';
import { Table, Select, Typography, Empty } from 'antd';
import { motion } from 'framer-motion';
import { createTablePagination } from '@/components/AppPagination';
import { APP_EMPTY_IMAGE } from '@/components/AppEmpty';
import {
    createProgressHistoryColumns,
    type HistoryTableRecord,
} from '../../configs/progressHistory.columns';

export type { HistoryTableRecord };

const { Title, Text } = Typography;

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
    const columns = useMemo(
        () => createProgressHistoryColumns({ onNavigateToSessionSubmit }),
        [onNavigateToSessionSubmit]
    );

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
                    <Title level={4} className="panel-title">
                        Chi Tiết Các Lượt Làm Bài
                    </Title>
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
                pagination={createTablePagination({ pageSize: 6, showSizeChanger: false, entityLabel: 'lịch sử' })}
                className="custom-table"
                locale={{
                    emptyText: (
                        <Empty
                            description="Chưa có dữ liệu làm bài thi."
                            image={APP_EMPTY_IMAGE}
                            imageStyle={{ height: 88 }}
                        />
                    ),
                }}
                columns={columns}
            />
        </motion.section>
    );
};
