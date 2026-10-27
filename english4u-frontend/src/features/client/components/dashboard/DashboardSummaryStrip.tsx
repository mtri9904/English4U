import React from 'react';
import { Typography } from 'antd';
import { motion } from 'framer-motion';
import { cardMotion } from '../../constants/client.constants';
import { fadeIn } from '../../utils/client.utils';

const { Text } = Typography;

export interface DashboardSummaryItem {
    label: string;
    value: string | number;
    detail: string;
    icon: React.ReactNode;
    color: string;
}

export interface DashboardSummaryStripProps {
    summaryItems: DashboardSummaryItem[];
}

export const DashboardSummaryStrip: React.FC<DashboardSummaryStripProps> = ({ summaryItems }) => {
    return (
        <section className="summary-strip">
            {summaryItems.map((item, index) => (
                <motion.div
                    key={item.label}
                    className="summary-card glass-card"
                    {...fadeIn(0.04 + index * 0.03)}
                    {...cardMotion}
                >
                    <div className="summary-icon" style={{ color: item.color, background: `${item.color}12` }}>
                        {item.icon}
                    </div>
                    <div>
                        <Text className="summary-label">{item.label}</Text>
                        <div className="summary-value">{item.value}</div>
                        <Text className="summary-detail">{item.detail}</Text>
                    </div>
                </motion.div>
            ))}
        </section>
    );
};
