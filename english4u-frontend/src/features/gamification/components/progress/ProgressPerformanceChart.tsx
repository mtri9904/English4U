import React from 'react';
import { Select, Typography, Empty } from 'antd';
import { motion } from 'framer-motion';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';
import { palette } from '../../constants/gamification.constants';

const { Title, Text } = Typography;

export interface ChartDataPoint {
    date: string;
    band: number;
    title: string;
    completedAt: string;
}

interface ProgressPerformanceChartProps {
    chartSkill: string;
    onChangeChartSkill: (skill: string) => void;
    chartData: ChartDataPoint[];
    activeChartColor: string;
}

export const ProgressPerformanceChart: React.FC<ProgressPerformanceChartProps> = ({
    chartSkill,
    onChangeChartSkill,
    chartData,
    activeChartColor,
}) => {
    return (
        <motion.section
            className="section-panel glass-card"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
        >
            <div className="panel-head">
                <div>
                    <Text className="eyebrow">Performance Chart</Text>
                    <Title level={4} className="panel-title">Xu Hướng Luyện Tập</Title>
                </div>
                <Select
                    value={chartSkill}
                    onChange={onChangeChartSkill}
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

            {chartData.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có dữ liệu điểm số cho kỹ năng này." />
            ) : (
                <div className="chart-wrap">
                    <ResponsiveContainer width="100%" height={280}>
                        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <defs>
                                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={activeChartColor} stopOpacity={0.2} />
                                    <stop offset="95%" stopColor={activeChartColor} stopOpacity={0.0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" />
                            <XAxis dataKey="date" tick={{ fill: palette.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                            <YAxis domain={[0, 9]} tickCount={10} tick={{ fill: palette.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                            <Tooltip
                                contentStyle={{
                                    background: '#fff',
                                    border: `1px solid ${palette.border}`,
                                    borderRadius: 12,
                                    boxShadow: '0 10px 25px rgba(0,0,0,0.05)',
                                }}
                                formatter={(value: any, _name: any, props: any) => [
                                    `Band ${Number(value).toFixed(1)}`,
                                    props?.payload?.title || 'Bài thi',
                                ]}
                            />
                            <Area
                                type="monotone"
                                dataKey="band"
                                stroke={activeChartColor}
                                strokeWidth={3}
                                fillOpacity={1}
                                fill="url(#chartGradient)"
                                dot={{ r: 4, stroke: activeChartColor, strokeWidth: 2, fill: '#fff' }}
                                activeDot={{ r: 6 }}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}
        </motion.section>
    );
};

